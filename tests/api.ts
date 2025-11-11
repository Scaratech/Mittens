import type { ConnectPacket } from "../src/types.js";
import { Mittens } from "../src/api.js";
import { generateConfig } from '../src/utils/config.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from "node:http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, '..', '..', 'config.json');
const config = generateConfig(
    JSON.parse(readFileSync(configPath, 'utf-8'))
);

const mit = new Mittens(config);
const server = createServer();

mit.onConnection(async (req) => {
    console.log(`${req.socket.remoteAddress} -> ${config.host}`);
});

mit.onConnectPacket(async (packet) => {
    console.log(`${(packet.payload as ConnectPacket).host}:${(packet.payload as ConnectPacket).port}`);
});

mit.onPacket(async (packet) => {
    console.log(JSON.stringify(packet, null, 2));
});

server.on('upgrade', (req, socket, head) => {
    mit.routeRequest(req, socket, head);
});

server.on('listening', () => console.log('Listening'));

server.listen({
    port: 3000,
});