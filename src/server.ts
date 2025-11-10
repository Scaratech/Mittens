import type { DataPacket, Packet } from './types.js';
import { generateConfig } from './utils/config.js';
import { rawToFormatted } from './utils/packets.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, '..', '..', 'config.json');

const config = generateConfig(
    JSON.parse(readFileSync(configPath, 'utf-8'))
);

function logPacket(packet: Packet) {
    console.log(JSON.stringify(packet, null, 2));
    
    if (packet.type === 0x02) {
        const dataPayload = packet.payload as DataPacket;

        try {
            const decoded = Buffer.from(dataPayload.payload, 'base64').toString('utf-8');
            console.log(`Decoded data:\n${decoded}`);

        } catch { }

        console.log(`${dataPayload.payload.length} bytes (b64)`);
    }
}

const wss = new WebSocketServer({
    host: config.bind?.host,
    port: config.bind?.port 
});

wss.on('listening', () => {
    console.log(`Listening on ws://${config.bind?.host}:${config.bind?.port}`);
    console.log(`Will forward to: ${config.host}`);
});

wss.on('error', console.error);

wss.on('connection', (clientWs, req) => {
    const ip = req.socket.remoteAddress || 'unknown';
    console.log(`[CLIENT] New connection from ${ip}`);

    const wispWs = new WebSocket(config.host);

    wispWs.on('open', () => {
        console.log(`[HOST] Connected to ${config.host}`);
    });

    wispWs.on('error', (error) => {
        console.error(`[HOST] Error:`, error.message);
        clientWs.close();
    });

    wispWs.on('close', () => {
        console.log(`[HOST] Connection closed`);
        clientWs.close();
    });

    wispWs.on('message', (msg) => {
        try {
            const formatted = rawToFormatted(msg as Buffer);

            console.log(`[HOST -> CLIENT]`);
            logPacket(formatted);

            clientWs.send(msg);
        } catch (err) {
            console.error(`[HOST -> CLIENT] Error:`, (err as Error).message);
        }
    });

    clientWs.on('message', (msg) => {
        try {
            const formatted = rawToFormatted(msg as Buffer);
``
            console.log(`[CLIENT -> HOST]`);
            logPacket(formatted);

            if (wispWs.readyState === WebSocket.OPEN) {
                wispWs.send(msg);
            }
        } catch (err) {
            console.error(`[CLIENT -> HOST] Error:`, (err as Error).message);
        }
    });

    clientWs.on('error', (err) => {
        console.error(`[CLIENT] Error:`, err.message);
        wispWs.close();
    });

    clientWs.on('close', () => {
        console.log(`[CLIENT] Connection closed from ${ip}`);
        wispWs.close();
    });
});
