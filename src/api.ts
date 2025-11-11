import {
    Packet,
    PacketType,
    Config
} from "./types.js";
import { rawToFormatted, formattedToRaw } from "./utils/packets.js";
import { Logger, createLogger } from "./middleware/logging/index.js";
import { Buffer } from "node:buffer";
import { Duplex } from "node:stream";
import { IncomingMessage } from "node:http";
import WebSocket, { WebSocketServer } from "ws";


type PacketCallback = (packet: Packet) => void | Promise<void>;
type ConnectionCallback = (req: IncomingMessage) => void | Promise<void>;

export class Mittens {
    private config: Config;
    private logger: Logger | null = null;

    private connectionCallbacks: ConnectionCallback[] = [];
    private packetCallbacks: PacketCallback[] = [];
    private connectCallbacks: PacketCallback[] = [];
    private dataCallbacks: PacketCallback[] = [];
    private closeCallbacks: PacketCallback[] = [];

    constructor(config: Config) {
        this.config = config;

        if (this.config.logging.enabled) {
            this.logger = createLogger(this.config);
        }
    }

    public onConnection(callback: ConnectionCallback) { this.connectionCallbacks.push(callback); }
    public onPacket(callback: PacketCallback) { this.packetCallbacks.push(callback); }
    public onConnectPacket(callback: PacketCallback) { this.connectCallbacks.push(callback); }
    public onDataPacket(callback: PacketCallback) { this.dataCallbacks.push(callback); }
    public onClosePacket(callback: PacketCallback) { this.closeCallbacks.push(callback); }

    private async processPacket(packet: Packet, req?: IncomingMessage, rawPacket?: Buffer): Promise<Packet> {
        let currentPacket = packet;

        if (this.logger) {
            switch (currentPacket.type) {
                case PacketType.CONNECT:
                    this.logger.logConnectPacket(currentPacket, req, rawPacket);
                    break;
                case PacketType.DATA:
                    this.logger.logDataPacket(currentPacket, req, rawPacket);
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
                typeCallbacks = this.dataCallbacks;
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
        if (this.logger) {
            this.logger.logConnection(req);
        }

        for (const callback of this.connectionCallbacks) await callback(req);

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
                    clientWs.send(msg);
                } catch (err) {
                    console.error(`[Mittens] Error forwarding packet (Wisp -> Client):`, (err as Error).message);
                }
            });

            clientWs.on('message', async (msg) => {
                try {
                    const rawBuffer = msg as Buffer;
                    const packet = rawToFormatted(rawBuffer);
                    const processedPacket = await this.processPacket(packet, req, rawBuffer);
                    const raw = formattedToRaw(processedPacket);

                    if (wispWs.readyState === WebSocket.OPEN) {
                        wispWs.send(raw);
                    }
                } catch (err) {
                    console.error(`[Mittens] Error forwarding packet (Client -> Wisp):`, (err as Error).message);
                }
            });

            clientWs.on('error', (err) => {
                console.error(`[Mittens] Client connection error:`, err.message);
                wispWs.close();
            });

            clientWs.on('close', () => {
                if (this.logger) {
                    this.logger.logDisconnection(req);
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
