import type { 
    ConnectPacket,
    DataPacket,
    ClosePacket,
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
        tls: false,
        ports: {
            type: 'whitelist',
            list: [80, 443]
        },
        hosts: {
            type: 'blacklist',
            list: ['scaratek.dev', '*.synthv.org']
        },
        direct_ip: false,
        private_ip: false,
        loopback_ip: false, 
    }
}));

const server = createServer();

// On Mittens connection
mit.onConnection((ip, host, ua, req) => {
    // Demo: Log connecting IPs
    console.log(`New connection from ${ip} to ${host} (${ua})`);
});

// On Mittens disconnection
mit.onDisconnection((ip, host, ua, req) => {
    // Demo: Log disconnecting IPs
    console.log(`Disconnection from ${ip} on host ${host} using ${ua}`);
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