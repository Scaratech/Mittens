import type { 
    ConnectPacket,
    DataPacket,
    ClosePacket,
} from "../src/index.js";
import { Mittens, generateConfig, CLOSE_REASONS } from "../src/index.js"; 
import { createServer } from "node:http";

const mit = new Mittens(generateConfig({
    host: "wss://wisp.mercurywork.shop/",
    logging: { enabled: false },
    filtering: { enabled: false }
}));

const server = createServer();

// On Mittens connection
mit.onConnection((req) => {
    // Demo: Log connecting IPs
    console.log(`New connection from ${req.socket.remoteAddress}`);
});

// On CONNECT packets
mit.onConnectPacket((packet) => {
    // Demo: Log sites being connected to
    const payload = packet.payload as ConnectPacket;
    console.log(`New connection to ${payload.host}:${payload.port}`);
});

// On DATA packets
mit.onDataPacket((packet) => {
    // Demo: Log traffic
    const payload = packet.payload as DataPacket;
    console.log('Packet data:');
    console.log(payload.payload);
});

// On CLOSE packets
mit.onClosePacket((packet) => {
    // Demo: Log errors
    const payload = packet.payload as ClosePacket;
    const reason = payload.reason;
    console.log(`Closed with code ${reason} (${CLOSE_REASONS[reason]})`);
});

// On ALL packets
mit.onPacket(async (packet) => {
    // Demo: Log packet
    console.log('Packet:');
    console.log(JSON.stringify(packet, null, 2));
});

server.on('upgrade', (req, socket, head) => {
    mit.routeRequest(req, socket, head);
});

server.on('listening', () => {
    console.log('Listening')
});

server.listen({
    port: 3000
});