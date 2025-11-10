import {
    Packet,
    PacketType,
    Config
} from "./types.js";
import { rawToFormatted, formattedToRaw } from "./utils/packets.js";
import { Buffer } from "node:buffer";
import { Duplex } from "node:stream";
import { IncomingMessage } from "node:http";
import WebSocket, { WebSocketServer } from "ws";


type PacketCallback = (packet: Packet) => void | Packet | Promise<void | Packet>;
type ConnectionCallback = (req: IncomingMessage) => void | Promise<void>;

export class Mittens {
    private config: Config;

    private connectionCallbacks: ConnectionCallback[] = [];
    private packetCallbacks: PacketCallback[] = [];
    private connectCallbacks: PacketCallback[] = [];
    private dataCallbacks: PacketCallback[] = [];
    private continueCallbacks: PacketCallback[] = [];
    private closeCallbacks: PacketCallback[] = [];

    constructor(config: Config) { this.config = config; }

    public onConnection(callback: ConnectionCallback) { this.connectionCallbacks.push(callback); }
    public onPacket(callback: PacketCallback) { this.packetCallbacks.push(callback); }
    public onConnectPacket(callback: PacketCallback) { this.connectCallbacks.push(callback); }
    public onDataPacket(callback: PacketCallback) { this.dataCallbacks.push(callback); }
    public onContinuePacket(callback: PacketCallback) { this.continueCallbacks.push(callback); }
    public onClosePacket(callback: PacketCallback) { this.closeCallbacks.push(callback); }

    private async processPacket(packet: Packet): Promise<Packet> {
        let currentPacket = packet;

        for (const callback of this.packetCallbacks) {
            const result = await callback(currentPacket);

            if (result) {
                currentPacket = result;
            }
        }

        let typeCallbacks: PacketCallback[] = [];

        switch (currentPacket.type) {
            case PacketType.CONNECT:
                typeCallbacks = this.connectCallbacks;
                break;
            case PacketType.DATA:
                typeCallbacks = this.dataCallbacks;
                break;
            case PacketType.CONTINUE:
                typeCallbacks = this.continueCallbacks;
                break;
            case PacketType.CLOSE:
                typeCallbacks = this.closeCallbacks;
                break;
        }

        for (const callback of typeCallbacks) {
            const result = await callback(currentPacket);

            if (result) {
                currentPacket = result;
            }
        }

        return currentPacket;
    }

    public async routeRequest(
        req: IncomingMessage,
        socket: Duplex,
        head: Buffer
    ) {
        for (const callback of this.connectionCallbacks) {
            await callback(req);
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
                    const packet = rawToFormatted(msg as Buffer);
                    const processedPacket = await this.processPacket(packet);
                    const raw = formattedToRaw(processedPacket);

                    clientWs.send(raw);
                } catch (err) {
                    console.error(`[Mittens] Error processing Wisp->Client packet:`, (err as Error).message);
                }
            });

            clientWs.on('message', async (msg) => {
                try {
                    const packet = rawToFormatted(msg as Buffer);
                    const processedPacket = await this.processPacket(packet);
                    const raw = formattedToRaw(processedPacket);
                    
                    if (wispWs.readyState === WebSocket.OPEN) {
                        wispWs.send(raw);
                    }
                } catch (err) {
                    console.error(`[Mittens] Error processing Client->Wisp packet:`, (err as Error).message);
                }
            });

            clientWs.on('error', (err) => {
                console.error(`[Mittens] Client connection error:`, err.message);
                wispWs.close();
            });

            clientWs.on('close', () => {
                wispWs.close();
            });
        });
    }
}
