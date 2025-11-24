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
    KeyAuthRecievedMetadata,
    KeyAuthSentMetadata,
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
type KeyAuthRecievedCallback = (algorithms: number, challenge: string) => void | Promise<void>;
type KeyAuthSentCallback = (algorithm: number, publicKeyHash: string, signature: string) => void | Promise<void>;
type InfoFinishedCallback = (info: WispInfo) => void | Promise<void>;

export class WispInfo {
    #version: { major: number; minor: number };
    #extensions: ExtensionMetadata[];
    constructor(
        version: { major: number; minor: number },
        extensions: ExtensionMetadata[]
    ) {
        this.#version = version;
        this.#extensions = extensions;
    }

    getVersion(): { major: number; minor: number } {
        return this.#version;
    }

    getExtensions(): ExtensionMetadata[] {
        return this.#extensions;
    }

    isPasswordAuthRequired(): boolean {
        const passwordExt = this.#extensions.find(
            ext => ext.id === ExtensionID.PASSWORD_AUTH
        ) as PasswordAuthServerMetadata | undefined;
        return passwordExt?.required ?? false;
    }

    isKeyAuthRequired(): boolean {
        const keyExt = this.#extensions.find(
            ext => ext.id === ExtensionID.KEY_AUTH
        ) as KeyAuthRecievedMetadata | undefined;
        return keyExt?.required ?? false;
    }

    isUDPSupported(): boolean {
        return this.#extensions.some(ext => ext.id === ExtensionID.UDP);
    }

    isMOTD(): boolean {
        return this.#extensions.some(ext => ext.id === ExtensionID.SERVER_MOTD);
    }

    getMOTD(): string {
        const motdExt = this.#extensions.find(
            ext => ext.id === ExtensionID.SERVER_MOTD
        ) as ServerMOTDMetadata | undefined;
        return motdExt?.motd ?? '';
    }

    isStreamOpenConfirmationSupported(): boolean {
        return this.#extensions.some(ext => ext.id === ExtensionID.STREAM_OPEN_CONFIRMATION);
    }
}

export class Mittens {
    #config: Config;
    #logger: Logger | null = null;

    #connectionCallbacks: ConnectionCallback[] = [];
    #disconnectionCallbacks: ConnectionCallback[] = [];
    #blockedCallbacks: BlockedCallback[] = [];
    #wispguardBlockedCallbacks: WispguardBlockedCallback[] = [];
    #packetCallbacks: PacketCallback[] = [];
    #connectCallbacks: PacketCallback[] = [];
    #dataPacketSentCallbacks: PacketCallback[] = [];
    #dataPacketReceivedCallbacks: PacketCallback[] = [];
    #continueCallbacks: PacketCallback[] = [];
    #closeCallbacks: PacketCallback[] = [];
    #infoPacketSentCallbacks: PacketCallback[] = [];
    #infoPacketReceivedCallbacks: PacketCallback[] = [];
    #passwordAuthCallbacks: PasswordAuthCallback[] = [];
    #KeyAuthRecievedCallbacks: KeyAuthRecievedCallback[] = [];
    #KeyAuthSentCallbacks: KeyAuthSentCallback[] = [];
    #infoFinishedCallbacks: InfoFinishedCallback[] = [];

    #que: Map<number, Promise<void>> = new Map();

    #serverVersion: { major: number; minor: number } | null = null;
    #serverExtensions: ExtensionMetadata[] = [];
    #clientVersion: { major: number; minor: number } = { major: 2, minor: 0 };
    #isWispV2: boolean = false;

    constructor(config: Config) {
        this.#config = config;

        if (this.#config.logging.enabled) {
            this.#logger = createLogger(this.#config);
        }
    }

    public onConnection(callback: ConnectionCallback) { this.#connectionCallbacks.push(callback); }
    public onDisconnection(callback: ConnectionCallback) { this.#disconnectionCallbacks.push(callback); }
    public onBlocked(callback: BlockedCallback) { this.#blockedCallbacks.push(callback); }
    public onWispguardBlocked(callback: WispguardBlockedCallback) { this.#wispguardBlockedCallbacks.push(callback); }
    public onPacket(callback: PacketCallback) { this.#packetCallbacks.push(callback); }
    public onConnectPacket(callback: PacketCallback) { this.#connectCallbacks.push(callback); }
    public onDataPacketSent(callback: PacketCallback) { this.#dataPacketSentCallbacks.push(callback); }
    public onDataPacketReceived(callback: PacketCallback) { this.#dataPacketReceivedCallbacks.push(callback); }
    public onContinuePacket(callback: PacketCallback) { this.#continueCallbacks.push(callback); }
    public onClosePacket(callback: PacketCallback) { this.#closeCallbacks.push(callback); }
    public onInfoPacketSent(callback: PacketCallback) { this.#infoPacketSentCallbacks.push(callback); }
    public onInfoPacketReceived(callback: PacketCallback) { this.#infoPacketReceivedCallbacks.push(callback); }
    public onPasswordAuth(callback: PasswordAuthCallback) { this.#passwordAuthCallbacks.push(callback); }
    public onKeyAuthRecieved(callback: KeyAuthRecievedCallback) { this.#KeyAuthRecievedCallbacks.push(callback); }
    public onKeyAuthSent(callback: KeyAuthSentCallback) { this.#KeyAuthSentCallbacks.push(callback); }
    public onInfoFinished(callback: InfoFinishedCallback) { this.#infoFinishedCallbacks.push(callback); }

     async #processPacket(
        packet: Packet, 
        req?: IncomingMessage, 
        rawPacket?: Buffer,
        direction: 'sent' | 'received' = 'sent'
    ): Promise<Packet | null> {
        let currentPacket = packet;

        if (currentPacket.type === PacketType.CONNECT) {
            const connectPayload = currentPacket.payload as ConnectPacket;
            const filterResult = await validateConnection(connectPayload, this.#config);

            if (!filterResult.allowed) {
                if (this.#logger) {
                    this.#logger.logBlocked(
                        connectPayload, 
                        req, 
                        filterResult.reason as any, 
                        currentPacket.streamId
                    );
                }

                for (const callback of this.#blockedCallbacks) {
                    await callback(connectPayload.host, connectPayload.port);
                }

                return null;
            }
        }

        if (currentPacket.type === PacketType.INFO) {
            const infoPayload = currentPacket.payload as InfoPacket;

            for (const ext of infoPayload.extensions) {
                if (ext.id === ExtensionID.PASSWORD_AUTH && 'username' in ext) {
                    const passwordExt = ext as PasswordAuthClientMetadata;

                    if (this.#logger) {
                        this.#logger.logPasswordAuth(passwordExt.username, passwordExt.password, req);
                    }

                    for (const callback of this.#passwordAuthCallbacks) {
                        await callback(passwordExt.username, passwordExt.password);
                    }
                } else if (ext.id === ExtensionID.KEY_AUTH) {
                    if ('supportedAlgorithms' in ext) {
                        const keyAuthServer = ext as KeyAuthRecievedMetadata;

                        if (this.#logger) {
                            this.#logger.logKeyAuthServer(keyAuthServer.supportedAlgorithms, keyAuthServer.challengeData, req);
                        }

                        for (const callback of this.#KeyAuthRecievedCallbacks) {
                            await callback(keyAuthServer.supportedAlgorithms, keyAuthServer.challengeData);
                        }
                    } else if ('selectedAlgorithm' in ext) {
                        const keyAuthClient = ext as KeyAuthSentMetadata;

                        if (this.#logger) {
                            this.#logger.logKeyAuthClient(
                                keyAuthClient.selectedAlgorithm,
                                keyAuthClient.publicKeyHash,
                                keyAuthClient.challengeSignature,
                                req
                            );
                        }

                        for (const callback of this.#KeyAuthSentCallbacks) {
                            await callback(
                                keyAuthClient.selectedAlgorithm,
                                keyAuthClient.publicKeyHash,
                                keyAuthClient.challengeSignature
                            );
                        }
                    }
                }
            }

            if (direction === 'received') {
                this.#serverVersion = {
                    major: infoPayload.majorWispVersion,
                    minor: infoPayload.minorWispVersion
                };
                this.#serverExtensions = infoPayload.extensions;

                if (this.#logger) {
                    this.#logger.logWispVersion(this.#serverVersion, this.#serverExtensions, req);
                }

                for (const callback of this.#infoPacketReceivedCallbacks) {
                    await callback(currentPacket);
                }
            } else {
                for (const callback of this.#infoPacketSentCallbacks) {
                    await callback(currentPacket);
                }
            }
        }

        if (this.#logger) {
            switch (currentPacket.type) {
                case PacketType.CONNECT:
                    this.#logger.logConnectPacket(currentPacket, req, rawPacket);
                    break;
                case PacketType.DATA:
                    this.#logger.logDataPacket(currentPacket, req, rawPacket, direction);
                    break;
                case PacketType.CONTINUE:
                    if (this.#logger.logContinuePacket) {
                        this.#logger.logContinuePacket(currentPacket, req, rawPacket);
                    }
                    break;
                case PacketType.CLOSE:
                    this.#logger.logClosePacket(currentPacket, req, rawPacket);
                    break;
                case PacketType.INFO:
                    if (this.#logger.logInfoPacket) {
                        this.#logger.logInfoPacket(currentPacket, req, rawPacket, direction);
                    }
                    break;
            }

            this.#logger.logPacket(currentPacket, req, rawPacket);
        }

        let typeCallbacks: PacketCallback[] = [];

        switch (currentPacket.type) {
            case PacketType.CONNECT:
                typeCallbacks = this.#connectCallbacks;
                break;
            case PacketType.DATA:
                typeCallbacks = direction === 'sent' ? this.#dataPacketSentCallbacks : this.#dataPacketReceivedCallbacks;
                break;
            case PacketType.CONTINUE:
                typeCallbacks = this.#continueCallbacks;
                break;
            case PacketType.CLOSE:
                typeCallbacks = this.#closeCallbacks;
                break;
        }

        for (const callback of typeCallbacks) await callback(currentPacket);
        for (const callback of this.#packetCallbacks) await callback(currentPacket);

        return currentPacket;
    }

    public async routeRequest(
        req: IncomingMessage,
        socket: Duplex,
        head: Buffer
    ) {
        const wispguardResult = validateRequest(this.#config, req);

        if (!wispguardResult.allowed) {
            const ip = this.#config.logging.log_ip ? getIP(this.#config, req) : '';
            const ua = req.headers['user-agent'] || 'unknown';
            const reason = wispguardResult.reason || 'unknown';

            if (this.#logger) {
                const entry = {
                    timestamp: new Date().toISOString(),
                    action: 'wispguardBlocked' as const,
                    details: {
                        event: 'wispguard_blocked',
                        reason: reason,
                        userAgent: ua
                    }
                };

                if (this.#config.logging.log_ip) {
                    entry['ip'] = ip;
                }

                this.#logger.log(entry);
            }

            for (const callback of this.#wispguardBlockedCallbacks) {
                await callback(ip, ua, reason);
            }

            socket.destroy();
            return;
        }

        if (this.#logger) {
            this.#logger.logConnection(req);
        }

        const ip = this.#config.logging.log_ip ? getIP(this.#config, req) : '';
        const ua = req.headers['user-agent'] || 'unknown';

        for (const callback of this.#connectionCallbacks) {
            await callback(ip, ua, req);
        }

        // Hell
        const rawProtocolHeader = req.headers['sec-websocket-protocol'];
        const requestedProtocolHeader = Array.isArray(rawProtocolHeader)
            ? rawProtocolHeader.join(',')
            : rawProtocolHeader;
        const upstreamProtocolHeader = requestedProtocolHeader && requestedProtocolHeader.trim().length > 0
            ? requestedProtocolHeader
            : 'wisp';

        if (requestedProtocolHeader) {
            delete req.headers['sec-websocket-protocol'];
        }

        const wss = new WebSocketServer({
            noServer: true
        });

        wss.handleUpgrade(req, socket as Duplex, head, (clientWs) => {
            const wispWs = new WebSocket(this.#config.host, undefined, {
                headers: {
                    'Sec-WebSocket-Protocol': upstreamProtocolHeader
                }
            });

            wispWs.on('error', (err) => {
                console.error(`[Mittens] Wisp connection error:`, err.message);
                clientWs.close();
            });

            wispWs.on('close', () => {
                clientWs.close();
            });

            let isFirstPacket = true;
            
            wispWs.on('message', async (msg) => {
                try {
                    const rawBuffer = msg as Buffer;
                    const packet = rawToFormatted(rawBuffer);
                    
                    // Wisp V2 detection
                    if (isFirstPacket) {
                        isFirstPacket = false;
                        
                        if (packet.type === PacketType.INFO) {
                            this.#isWispV2 = true;
                            await this.#processPacket(packet, req, rawBuffer, 'received');

                            if (this.#serverVersion && this.#serverExtensions) {
                                const wispInfo = new WispInfo(this.#serverVersion, this.#serverExtensions);

                                for (const callback of this.#infoFinishedCallbacks) {
                                    await callback(wispInfo);
                                }
                            }
                        } else if (packet.type === PacketType.CONTINUE && packet.streamId === 0) {
                            // Wisp V1 fallback 
                            this.#isWispV2 = false;
                            this.#serverVersion = { major: 1, minor: 0 };
                            this.#serverExtensions = [];

                            const wispInfo = new WispInfo(this.#serverVersion, this.#serverExtensions);
                            for (const callback of this.#infoFinishedCallbacks) {
                                await callback(wispInfo);
                            }
                        }
                    }
                    
                    if (packet.type === PacketType.DATA) {
                        await this.#processPacket(packet, req, rawBuffer, 'received');
                    } else if (packet.type === PacketType.CONTINUE) {
                        await this.#processPacket(packet, req, rawBuffer, 'received');
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
                    const previousPromise = this.#que.get(streamId) || Promise.resolve();

                    const currentPromise = previousPromise.then(async () => {
                        const processedPacket = await this.#processPacket(packet, req, rawBuffer);

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

                    this.#que.set(streamId, currentPromise);

                    if (packet.type === PacketType.CLOSE) {
                        currentPromise.finally(() => {
                            this.#que.delete(streamId);
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
                if (this.#logger) {
                    this.#logger.logDisconnection(req);
                }

                for (const callback of this.#disconnectionCallbacks) {
                    await callback(ip, ua, req);
                }

                wispWs.close();
            });
        });
    }

    public async close(): Promise<void> {
        if (this.#logger) {
            await this.#logger.close();
        }
    }
}
