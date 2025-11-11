# Mittens
Middleware for your [Wisp](https://github.com/mercuryworkshop/wisp-protocol) server.
> [!WARNING]
> Currently Mittens only supports Wisp servers on v1.2 or below. v2.0 support is planned for a future update.
> In addition, (as of now), Mittens can only apply middleware to messages sent by the client, not the server.

## Features
- Logging
- Filtering (Apply restrictions even if the Wisp server doesn't support them)
- Anti DDoS (WiP!!!)
- Plugins (Configurable middleware)

## Why Mittens?
Mittens allows developers or sysadmins to easily secure and monitor traffic sent over their Wisp server. This can be beneficial for easily monitor traffic sent over your Wisp server, blocking malicious traffic, preventing exploits, and more!
### Why Not?
Mittens is written in NodeJS. This means performance will unfortunately suffer. While I have not run any benchmarking tools like [WispMark](https://github.com/MercuryWorkshop/wispmark), it is fairly safe to assume that the traffic sent over Mittens will be quite slower then the Wisp server, as NodeJS is *pretty* slow compared to languages like Rust, which, for example, [epoxy](https://github.com/MercuryWorkshop/epoxy-tls/tree/multiplexed/server) uses. 

## Plugin System
```ts
import type { 
    ConnectPacket,
    DataPacket,
    ContinuePacket,
    ClosePacket
} from "@scaratech/mittens";
import { CLOSE_REASONS, Mittens, generateConfig } from "@scaratech/mittens"; 
import { createServer } from "node:http";

const mit = new Mittens(generateConfig({
    host: "wss://wisp.mercurywork.shop/",
    logging: { enabled: false },
    wispguard: { enabled: false },
    filtering: { enabled: false }
}));

const server = createServer();

// On Mittens connection
mit.onConnection((ip, host, ua, req) => {
    // Demo: Log connecting IPs
    console.log(`New connection from ${ip} to ${host} (${ua})`);
});

// On connection filtered
mit.onBlocked((host, port) => {
    // Demo: log what got blocked
    console.log(`Connection to ${host}:${port} was blocked`);
});

// On wispguard blocked
mit.onWispguardBlocked((ip, host, ua, reason) => {
    // Demo: log wispguard blocks
    console.log(`Wispguard blocked ${ip} from ${host} (${ua}) - Reason: ${reason}`);
});

// On Mittens disconnection
mit.onDisconnection((ip, host, ua, req) => {
    // Demo: Log disconnecting IPs
    console.log(`Disconnection from ${ip} on host ${host} using ${ua}`);
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
```

## Configuration
How to configure Mittens
### CLI
See `config.example.jsonc`
### Programmable
```ts
import { Mittens, generateConfig } from "@scaratech/mittens";

const mit = new Mittens(generateConfig({
    host: "ws://localhost:3000/wisp/", // Wisp server
    bind: { // Server configuration
        host: "0.0.0.0", // Interface to bind to
        port: 3000 // Port to bind to
    },
    logging: { // Logging configuration
        enabled: true, // Enable logging
        log_ip: true, // Log client IP addresses
        trust_proxy: true, // Trust reverse proxies
        proxy_header: "X-Forwarded-For", // Header to get client IP from (X-Forwarded-For, X-Real-IP, CF-Connecting-IP)
        log_type: "log", // Log file format (log, json)
        log_dir: "./logs", // Directory to store log files
        log_actions: [ // Actions that get logged
            "connection", // Connections & disconnections to Wisp server
            "error", // Client & server errors (CLOSE packet)
            "CONNECT", // CONNECT packets
            "DATA", // DATA packets
            "blocked", // Client tried to access something blocked by the filter rules
            "*" // Log ALL traffic, actions, raw packets, parsed packets, complete request objects, and more
        ]
    },
    wispguard: { // Wispguard configuration
        enabled: true, // Enable wispguard
        ip: { // IP configuration
            type: 'whitelist', // IP filtering type (whitelist, blackist)
            list: ['::ffff:127.0.0.1'] // List of IPs
        },
        ua: { // UA (user agent) configuration
            type: 'whitelist', // UA filtering type (whitelist, blacklist)
            list: ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'] // List of UAs
        }
    },
    filtering: { // Filter configuration
        enabled: true, // Enable filtering
        tcp: true, // Allow TCP connections
        udp: false, // Allow UDP connections
        tls: true, // Allow HTTPS traffic
        ports: {
            type: "whitelist", // Port filtering type (whitelist, blacklist)
            list: [80, 443, [8000, 8100]] // List of ports and/or port ranges
        },
        hosts: { // Hosts configuration
            type: "blacklist", // Host filtering type (whitelist, blacklist)
            list: ["scaratek.dev", "*.holo.cat"] // List of hostnames (wildcard support)
        },
        direct_ip: false, // Allow direct IP connections (E.g. 152.53.90.161)
        private_ip: false, // Allow private IP connections (E.g. 192.168.0.1)
        loopback_ip: false // Allow loopback IP connections (E.g. localhost, 0.0.0.0, 127.0.0.1, etc.)
    }
}));
```

## CLI
Easily spin up a Mittens server
> [!IMPORTANT]
> The source code for the mittens-cli is located in a [different repository](https://github.com/scaratech/mittens)!
```sh
$ pnpm dlx @scaratech/mittens-cli -c ./path_to_config.json
```

## Changelog
- V1 Release!

## TODO
### `v1`
- CLI (seperate package)

## Credit
- Mittens is maintained and developed by [me](https://scaratek.dev) and is licensed under the [AGPLv3 license](./LICENSE).
- [`mittens-cli`](https://github.com/scaratech/mittens-cli) was also developed by [me](https://scaratek.dev) and is also licensed under the [AGPLv3 license](./LICENSE).
- Mittens is middleware for any existing server implementation of the [Wisp protocol](https://github.com/mercuryworkshop/wisp-protocol). Wisp is licensed under the [CC-BY-4.0 license](https://github.com/MercuryWorkshop/wisp-protocol/blob/main/LICENSE) and was mostly written by [ading2210](https://ading.dev/).