import type { 
    ConnectPacket,
    DataPacket,
    ContinuePacket,
    ClosePacket,
    InfoPacket,
} from "../src/index.js";
import { Mittens, generateConfig, CLOSE_REASONS } from "../src/index.js"; 
import { createServer } from "node:http";

const mit = new Mittens(generateConfig({
    host: "wss://wisp.mercurywork.shop/",
    logging: { 
        enabled: true,
        log_ip: true,
        log_type: 'json',
        log_dir: './logs',
        log_actions: ['connection', 'error', 'CONNECT', 'DATA', 'blocked', 'wispguardBlocked']
    },
    wispguard: {
        enabled: true,
        ip: {
            type: 'whitelist',
            list: ['::ffff:127.0.0.1']
        },
        ua: {
            type: 'whitelist',
            list: ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36']
        }
    },
    filtering: { 
        enabled: true,
        tcp: true,
        udp: false,
        ports: {
            type: 'whitelist',
            list: [80, 443]
        },
        hosts: {
            type: 'blacklist',
            list: ['*.holo.cat']
        },
        direct_ip: false,
        private_ip: false,
        loopback_ip: false, 
    }
}));

const server = createServer();

// On Mittens connection
mit.onConnection((ip, ua) => {
    // Demo: Log connecting IPs
    console.log(`New connection from ${ip} (${ua})`);
});

// On Mittens disconnection
mit.onDisconnection((ip, ua) => {
    // Demo: Log disconnecting IPs
    console.log(`Disconnection from ${ip} (${ua})`);
});

// On connection filtered
mit.onBlocked((host, port) => {
    // Demo: log what got blocked
    console.log(`Connection to ${host}:${port} was blocked`);
});

// On Wispguard blocked
mit.onWispguardBlocked((ip, ua, reason) => {
    // Demo: log what got blocked by wispguard
    console.log(`Wispguard blocked connection from ${ip} (${ua}) due to ${reason}`);
});

// Wisp V2 - On INFO packet received
mit.onInfoPacketReceived((packet) => {
    // Demo: Log server info
    const payload = packet.payload as InfoPacket;
    console.log(`Server Wisp v${payload.majorWispVersion}.${payload.minorWispVersion}`);
    console.log(`Server extensions:`, payload.extensions.map(e => e.id));
    
    // Check what the server supports
    console.log(`UDP Supported: ${mit.isUDPSupported()}`);
    console.log(`Password Auth Required: ${mit.isPasswordAuthRequired()}`);
    console.log(`Key Auth Required: ${mit.isKeyAuthRequired()}`);
    console.log(`Stream Open Confirmation Supported: ${mit.isStreamOpenConfirmationSupported()}`);
    
    if (mit.isMOTD()) {
        console.log(`Server MOTD: ${mit.getMOTD()}`);
    }
});

// Wisp V2 - On INFO packet sent
mit.onInfoPacketSent((packet) => {
    // Demo: Log client info
    const payload = packet.payload as InfoPacket;
    console.log(`Client Wisp v${payload.majorWispVersion}.${payload.minorWispVersion}`);
});

// Wisp V2 - On password authentication
mit.onPasswordAuth((username, password) => {
    // Demo: Log authentication attempts
    console.log(`Password auth attempt - Username: ${username}, Password: ${password}`);
});

// Wisp V2 - On key auth (server)
mit.onKeyAuthServer((algorithms, challenge) => {
    // Demo: Log key auth challenge from server
    console.log(`Key auth challenge received - Algorithms: ${algorithms}, Challenge: ${challenge}`);
});

// Wisp V2 - On key auth (client)
mit.onKeyAuthClient((algorithm, publicKeyHash, signature) => {
    // Demo: Log key auth response from client
    console.log(`Key auth response - Algorithm: ${algorithm}, Public Key Hash: ${publicKeyHash}`);
});

// On CONNECT packets
mit.onConnectPacket((packet) => {
    // Demo: Log sites being connected to
    const payload = packet.payload as ConnectPacket;
    console.log(`New connection to ${payload.host}:${payload.port}`);
});

// On DATA packets sent (client -> server)
mit.onDataPacketSent((packet) => {
    // Demo: Log traffic sent from client
    const payload = packet.payload as DataPacket;
    console.log('Packet data sent (client -> server):');
    console.log(payload.payload);
});

// On DATA packets received (server -> client)
mit.onDataPacketReceived((packet) => {
    // Demo: Log traffic received from server
    const payload = packet.payload as DataPacket;
    console.log('Packet data received (server -> client):');
    console.log(payload.payload);
});

// On CONTINUE packets
mit.onContinuePacket((packet) => {
    // Demo: Log buffer remaining updates
    const payload = packet.payload as ContinuePacket;
    console.log(`Buffer remaining for stream ${packet.streamId}: ${payload.remaining}`);
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