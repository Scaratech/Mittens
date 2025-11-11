import type { Config } from "../src/types.js";
import { generateConfig } from "../src/utils/config.js";

const config1: Config = {
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
            "*" // Log all traffic and actions (Not formatted for readability)
        ]
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
        },
        host: {
            type: 'whitelist',
            list: ['0.0.0.0:8080']
        }
    },
    filtering: { // Filter configuration
        enabled: true, // Enable filtering
        tcp: true, // Allow TCP connections
        udp: false, // Allow UDP connections
        ports: { // Port configuration
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
}

const config2: Config = {
    host: "ws://localhost:3000/wisp/",
    logging: {
        enabled: true,
        log_ip: true,
        trust_proxy: true,
        proxy_header: 'CF-Connecting-IP',
        log_type: 'json',
        log_dir: './logs',
        log_actions: ['*']
    },
    wispguard: {
        enabled: true,
        ip: {
            type: 'blacklist',
            list: ['152.53.90.161']
        },
        ua: {
            type: 'blacklist',
            list: ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36']
        },
        host: {
            type: 'whitelist',
            list: ['nebulaservices.org']
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
            list: ['*.pornhub.com']
        },
        direct_ip: true,
        private_ip: false,
        loopback_ip: false
    }
};

const config3: Config = {
    host: 'ws://localhost:3000/wisp/',
    logging: {
        enabled: true
    },
    wispguard: {
        enabled: true
    },
    filtering: {
        enabled: true
    }
};

const config4: Config = {
    host: 'ws://localhost:3000/wisp/',
    bind: {
        host: '0.0.0.0',
        port: 3000
    },
    logging: {
        enabled: false
    },
    wispguard: {
        enabled: false
    },
    filtering: {
        enabled: false
    }
};

console.log(JSON.stringify(generateConfig(config1), null, 2));
console.log();

console.log(JSON.stringify(generateConfig(config2), null, 2));
console.log();

console.log(JSON.stringify(generateConfig(config3), null, 2));
console.log();

console.log(JSON.stringify(generateConfig(config4), null, 2));
