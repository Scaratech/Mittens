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

// On INFO packet sent
mit.onInfoPacketSent((packet) => {
    // Demo: Log some info!
    const payload = packet.payload as InfoPacket;
    console.log(`v${payload.majorWispVersion}.${payload.minorWispVersion}`);
    console.log('Extensions:');
    payload.extensions.forEach((ext) => {
        console.log(`- ${ext.id}`);
    });
});

// On INFO packet received
mit.onInfoPacketReceived((packet) => {
    // Demo: Log some info!
    const payload = packet.payload as InfoPacket;
    console.log(`v${payload.majorWispVersion}.${payload.minorWispVersion}`);
    console.log('Extensions:');
    payload.extensions.forEach((ext) => {
        console.log(`- ${ext.id}`);
    });
});

// Get Wisp version
console.log(`Wisp version: ${mit.getVersion()}`);

// Get extensions
console.log(`Extensions: ${mit.getExtensions()}`);

// Is password auth required
console.log(`Password auth: ${mit.isPasswordAuthRequired()}`);

// Is key auth required
console.log(`Key auth: ${mit.isKeyAuthRequired()}`);

// Is UDP supported
console.log(`UDP supported: ${mit.isUDPSupported()}`);

// Is MOTD extension
console.log(`MOTD supported: ${mit.isMOTD()}`);

// Get MOTD
console.log(`MOTD: ${mit.getMOTD()}`);

// Is Stream Open Confirmation supported
console.log(`Stream Open Confirmation supported: ${mit.isStreamOpenConfirmationSupported()}`);

// On password auth
mit.onPasswordAuth((username, password) => {
    // Demo: Log credentials
    console.log(`Auth: "${username}" | "${password}"`);
});

// On key auth recieved
mit.onKeyAuthRecieved((algs, challenge) => {
    // Demo: Log key auth request
    console.log('Key Auth Request:');
    console.log(`Algorithms: ${algs}`);
    console.log(`Challenge: ${Buffer.from(challenge).toString('base64')}`);
});

// On key auth sent
mit.onKeyAuthSent((alg, pubKeyHash, signature) => {
    // Demo: Log key auth response
    console.log('Key Auth Response:');
    console.log(`Algorithm: ${alg}`);
    console.log(`Public Key Hash: ${Buffer.from(pubKeyHash).toString('base64')}`);
    console.log(`Signature: ${Buffer.from(signature).toString('base64')}`);
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