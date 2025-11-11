import {
    Packet,
    PacketType,
    Config,
    ConnectPacket,
    ClosePacket,
    InfoPacket,
    ExtensionMetadata,
    ExtensionID,
    PasswordAuthServerMetadata,
    PasswordAuthClientMetadata,
    KeyAuthServerMetadata,
    KeyAuthClientMetadata,
    ServerMOTDMetadata
} from "./types.js";
import { rawToFormatted, formattedToRaw, constructFormatted } from "./utils/packets.js";
import { Logger, createLogger } from "./middleware/logging/index.js";
import { validateConnection } from "./middleware/filtering/index.js";
import { validateRequest } from "./middleware/wispguard/index.js";
import { getIP } from "./middleware/logging/utils.js";
import { Buffer } from "node:buffer";
import { Duplex } from "node:stream";
 import { IncomingMessage } from "node:http";
import WebSocket, { WebSocketServer } from "ws";


type PacketCallback = (packet: Packet) => void | Promise<void>;
type ConnectionCallback = (ip: string, ua: string, req: IncomingMessage) => void | Promise<void>;
type BlockedCallback = (host: string, port: number) => void | Promise<void>;
type WispguardBlockedCallback = (ip: string, ua: string, reason: string) => void | Promise<void>;
type PasswordAuthCallback = (username: string, password: string) => void | Promise<void>;
type KeyAuthServerCallback = (algorithms: number, challenge: string) => void | Promise<void>;
type KeyAuthClientCallback = (algorithm: number, publicKeyHash: string, signature: string) => void | Promise<void>;

export class Mittens {
    private config: Config;
    private logger: Logger | null = null;

    private connectionCallbacks: ConnectionCallback[] = [];
    private disconnectionCallbacks: ConnectionCallback[] = [];
    private blockedCallbacks: BlockedCallback[] = [];
    private wispguardBlockedCallbacks: WispguardBlockedCallback[] = [];
    private packetCallbacks: PacketCallback[] = [];
    private connectCallbacks: PacketCallback[] = [];
    private dataPacketSentCallbacks: PacketCallback[] = [];
    private dataPacketReceivedCallbacks: PacketCallback[] = [];
    private continueCallbacks: PacketCallback[] = [];
    private closeCallbacks: PacketCallback[] = [];
    private infoPacketSentCallbacks: PacketCallback[] = [];
    private infoPacketReceivedCallbacks: PacketCallback[] = [];
    private passwordAuthCallbacks: PasswordAuthCallback[] = [];
    private keyAuthServerCallbacks: KeyAuthServerCallback[] = [];
    private keyAuthClientCallbacks: KeyAuthClientCallback[] = [];

    private que: Map<number, Promise<void>> = new Map();

    private serverVersion: { major: number; minor: number } | null = null;
    private serverExtensions: ExtensionMetadata[] = [];
    private clientVersion: { major: number; minor: number } = { major: 2, minor: 0 };

    constructor(config: Config) {
        this.config = config;

        if (this.config.logging.enabled) {
            this.logger = createLogger(this.config);
        }
    }

    public onConnection(callback: ConnectionCallback) { this.connectionCallbacks.push(callback); }
    public onDisconnection(callback: ConnectionCallback) { this.disconnectionCallbacks.push(callback); }
    public onBlocked(callback: BlockedCallback) { this.blockedCallbacks.push(callback); }
    public onWispguardBlocked(callback: WispguardBlockedCallback) { this.wispguardBlockedCallbacks.push(callback); }
    public onPacket(callback: PacketCallback) { this.packetCallbacks.push(callback); }
    public onConnectPacket(callback: PacketCallback) { this.connectCallbacks.push(callback); }
    public onDataPacketSent(callback: PacketCallback) { this.dataPacketSentCallbacks.push(callback); }
    public onDataPacketReceived(callback: PacketCallback) { this.dataPacketReceivedCallbacks.push(callback); }
    public onContinuePacket(callback: PacketCallback) { this.continueCallbacks.push(callback); }
    public onClosePacket(callback: PacketCallback) { this.closeCallbacks.push(callback); }
    public onInfoPacketSent(callback: PacketCallback) { this.infoPacketSentCallbacks.push(callback); }
    public onInfoPacketReceived(callback: PacketCallback) { this.infoPacketReceivedCallbacks.push(callback); }
    public onPasswordAuth(callback: PasswordAuthCallback) { this.passwordAuthCallbacks.push(callback); }
    public onKeyAuthServer(callback: KeyAuthServerCallback) { this.keyAuthServerCallbacks.push(callback); }
    public onKeyAuthClient(callback: KeyAuthClientCallback) { this.keyAuthClientCallbacks.push(callback); }

    public getVersion(): { major: number; minor: number } | null {
        return this.serverVersion;
    }

    public getExtensions(): ExtensionMetadata[] {
        return this.serverExtensions;
    }

    public isPasswordAuthRequired(): boolean {
        const passwordExt = this.serverExtensions.find(
            ext => ext.id === ExtensionID.PASSWORD_AUTH
        ) as PasswordAuthServerMetadata | undefined;

        return passwordExt?.required ?? false;
    }

    public isKeyAuthRequired(): boolean {
        const keyExt = this.serverExtensions.find(
            ext => ext.id === ExtensionID.KEY_AUTH
        ) as KeyAuthServerMetadata | undefined;

        return keyExt?.required ?? false;
    }

    public isUDPSupported(): boolean {
        return this.serverExtensions.some(ext => ext.id === ExtensionID.UDP);
    }

    public isMOTD(): boolean {
        return this.serverExtensions.some(ext => ext.id === ExtensionID.SERVER_MOTD);
    }

    public getMOTD(): string {
        const motdExt = this.serverExtensions.find(
            ext => ext.id === ExtensionID.SERVER_MOTD
        ) as ServerMOTDMetadata | undefined;

        return motdExt?.motd ?? '';
    }

    public isStreamOpenConfirmationSupported(): boolean {
        return this.serverExtensions.some(ext => ext.id === ExtensionID.STREAM_OPEN_CONFIRMATION);
    }

    private async processPacket(
        packet: Packet, 
        req?: IncomingMessage, 
        rawPacket?: Buffer,
        direction: 'sent' | 'received' = 'sent'
    ): Promise<Packet | null> {
        let currentPacket = packet;

        if (currentPacket.type === PacketType.CONNECT) {
            const connectPayload = currentPacket.payload as ConnectPacket;
            const filterResult = await validateConnection(connectPayload, this.config);

            if (!filterResult.allowed) {
                if (this.logger) {
                    this.logger.logBlocked(
                        connectPayload, 
                        req, 
                        filterResult.reason as any, 
                        currentPacket.streamId
                    );
                }

                for (const callback of this.blockedCallbacks) {
                    await callback(connectPayload.host, connectPayload.port);
                }

                return null;
            }
        }

        if (currentPacket.type === PacketType.INFO) {
            const infoPayload = currentPacket.payload as InfoPacket;
            
            if (direction === 'received') {
                this.serverVersion = {
                    major: infoPayload.majorWispVersion,
                    minor: infoPayload.minorWispVersion
                };
                this.serverExtensions = infoPayload.extensions;

                for (const ext of infoPayload.extensions) {
                    if (ext.id === ExtensionID.PASSWORD_AUTH && 'username' in ext) {
                        const passwordExt = ext as PasswordAuthClientMetadata;

                        for (const callback of this.passwordAuthCallbacks) {
                            await callback(passwordExt.username, passwordExt.password);
                        }
                    } else if (ext.id === ExtensionID.KEY_AUTH) {
                        if ('supportedAlgorithms' in ext) {
                            const keyAuthServer = ext as KeyAuthServerMetadata;

                            for (const callback of this.keyAuthServerCallbacks) {
                                await callback(keyAuthServer.supportedAlgorithms, keyAuthServer.challengeData);
                            }
                        } else if ('selectedAlgorithm' in ext) {
                            const keyAuthClient = ext as KeyAuthClientMetadata;

                            for (const callback of this.keyAuthClientCallbacks) {
                                await callback(
                                    keyAuthClient.selectedAlgorithm,
                                    keyAuthClient.publicKeyHash,
                                    keyAuthClient.challengeSignature
                                );
                            }
                        }
                    }
                }

                for (const callback of this.infoPacketReceivedCallbacks) {
                    await callback(currentPacket);
                }
            } else {
                for (const callback of this.infoPacketSentCallbacks) {
                    await callback(currentPacket);
                }
            }
        }

        if (this.logger) {
            switch (currentPacket.type) {
                case PacketType.CONNECT:
                    this.logger.logConnectPacket(currentPacket, req, rawPacket);
                    break;
                case PacketType.DATA:
                    this.logger.logDataPacket(currentPacket, req, rawPacket, direction);
                    break;
                case PacketType.CONTINUE:
                    if (this.logger.logContinuePacket) {
                        this.logger.logContinuePacket(currentPacket, req, rawPacket);
                    }
                    break;
                case PacketType.CLOSE:
                    this.logger.logClosePacket(currentPacket, req, rawPacket);
                    break;
            }

            this.logger.logPacket(currentPacket, req, rawPacket);
        }

        let typeCallbacks: PacketCallback[] = [];

        switch (currentPacket.type) {
            case PacketType.CONNECT:
                typeCallbacks = this.connectCallbacks;
                break;
            case PacketType.DATA:
                typeCallbacks = direction === 'sent' ? this.dataPacketSentCallbacks : this.dataPacketReceivedCallbacks;
                break;
            case PacketType.CONTINUE:
                typeCallbacks = this.continueCallbacks;
                break;
            case PacketType.CLOSE:
                typeCallbacks = this.closeCallbacks;
                break;
        }

        for (const callback of typeCallbacks) await callback(currentPacket);
        for (const callback of this.packetCallbacks) await callback(currentPacket);

        return currentPacket;
    }

    public async routeRequest(
        req: IncomingMessage,
        socket: Duplex,
        head: Buffer
    ) {
        const wispguardResult = validateRequest(this.config, req);

        if (!wispguardResult.allowed) {
            const ip = this.config.logging.log_ip ? getIP(this.config, req) : '';
            const ua = req.headers['user-agent'] || 'unknown';
            const reason = wispguardResult.reason || 'unknown';

            if (this.logger) {
                const entry = {
                    timestamp: new Date().toISOString(),
                    action: 'wispguardBlocked' as const,
                    details: {
                        event: 'wispguard_blocked',
                        reason: reason,
                        userAgent: ua
                    }
                };

                if (this.config.logging.log_ip) {
                    entry['ip'] = ip;
                }

                this.logger.log(entry);
            }

            for (const callback of this.wispguardBlockedCallbacks) {
                await callback(ip, ua, reason);
            }

            socket.destroy();
            return;
        }

        if (this.logger) {
            this.logger.logConnection(req);
        }

        const ip = this.config.logging.log_ip ? getIP(this.config, req) : '';
        const ua = req.headers['user-agent'] || 'unknown';

        for (const callback of this.connectionCallbacks) {
            await callback(ip, ua, req);
        }

        const wss = new WebSocketServer({
            noServer: true
        });

        wss.handleUpgrade(req, socket as Duplex, head, (clientWs) => {
            const wispWs = new WebSocket(this.config.host);

            wispWs.on('error', (err) => {
                console.error(`[Mittens] Wisp connection error:`, err.message);
                clientWs.close();
            });

            wispWs.on('close', () => {
                clientWs.close();
            });

            wispWs.on('message', async (msg) => {
                try {
                    const rawBuffer = msg as Buffer;
                    const packet = rawToFormatted(rawBuffer);
                    
                    if (packet.type === PacketType.INFO) {
                        await this.processPacket(packet, req, rawBuffer, 'received');
                        
                        const clientInfoPacket = constructFormatted({
                            type: PacketType.INFO,
                            streamId: 0,
                            payload: {
                                majorWispVersion: this.clientVersion.major,
                                minorWispVersion: this.clientVersion.minor,
                                extensions: []
                            } as InfoPacket
                        });
                        
                        const clientInfoRaw = formattedToRaw(clientInfoPacket);
                        await this.processPacket(clientInfoPacket, req, Buffer.from(clientInfoRaw), 'sent');
                        
                        if (wispWs.readyState === WebSocket.OPEN) {
                            wispWs.send(clientInfoRaw);
                        }
                    } else if (packet.type === PacketType.DATA) {
                        await this.processPacket(packet, req, rawBuffer, 'received');
                    } else if (packet.type === PacketType.CONTINUE) {
                        await this.processPacket(packet, req, rawBuffer, 'received');
                    }
                    
                    clientWs.send(msg);
                } catch (err) {
                    console.error(`[Mittens] Error forwarding packet (Wisp -> Client):`, (err as Error).message);
                }
            });

            clientWs.on('message', async (msg) => {
                try {
                    const rawBuffer = msg as Buffer;
                    const packet = rawToFormatted(rawBuffer);
                    const streamId = packet.streamId;
                    const previousPromise = this.que.get(streamId) || Promise.resolve();

                    const currentPromise = previousPromise.then(async () => {
                        const processedPacket = await this.processPacket(packet, req, rawBuffer);

                        if (processedPacket === null) {
                            const closePacket = constructFormatted({
                                type: PacketType.CLOSE,
                                streamId: packet.streamId,
                                payload: {
                                    reason: 0x48
                                } as ClosePacket
                            });

                            const closeRaw = formattedToRaw(closePacket);
                            
                            if (clientWs.readyState === WebSocket.OPEN) {
                                clientWs.send(closeRaw);
                            }
                            
                            return;
                        }

                        const raw = formattedToRaw(processedPacket);

                        if (wispWs.readyState === WebSocket.OPEN) {
                            wispWs.send(raw);
                        }
                    }).catch((err) => {
                        console.error(`[Mittens] Error forwarding packet (Client -> Wisp):`, (err as Error).message);
                    });

                    this.que.set(streamId, currentPromise);

                    if (packet.type === PacketType.CLOSE) {
                        currentPromise.finally(() => {
                            this.que.delete(streamId);
                        });
                    }
                } catch (err) {
                    console.error(`[Mittens] Error handling packet:`, (err as Error).message);
                }
            });

            clientWs.on('error', (err) => {
                console.error(`[Mittens] Client connection error:`, err.message);
                wispWs.close();
            });

            clientWs.on('close', async () => {
                if (this.logger) {
                    this.logger.logDisconnection(req);
                }

                for (const callback of this.disconnectionCallbacks) {
                    await callback(ip, ua, req);
                }

                wispWs.close();
            });
        });
    }

    public async close(): Promise<void> {
        if (this.logger) {
            await this.logger.close();
        }
    }
}
