import type { Config } from "../types";

export function generateConfig(config: Config): Config {
    let mergedConfig: Config = {
        host: config.host,
        bind: undefined,
        logging: {
            enabled: true,
            log_ip: false,
            trust_proxy: false,
            log_type: 'log',
            log_dir: './logs',
            log_actions: []
        },
        filtering: {
            enabled: true,
            tcp: true,
            udp: true,
            tls: true,
            direct_ip: true,
            private_ip: true,
            loopback_ip: true,
            ports: {
                type: 'blacklist',
                list: []
            },
            hosts: {
                type: 'blacklist',
                list: []
            }
        }
    };

    if (config.bind) {
        mergedConfig.bind = {
            host: config.bind.host ?? '127.0.0.1',
            port: config.bind.port
        };
    }

    if (config.logging.enabled === true) {
        mergedConfig.logging = {
            enabled: true,
            log_ip: config.logging.log_ip ?? true,
            trust_proxy: config.logging.trust_proxy ?? false,
            log_type: config.logging.log_type ?? 'log',
            log_dir: config.logging.log_dir ?? './logs',
            log_actions: config.logging.log_actions ?? ['connection', 'error']
        };

        if (config.logging.proxy_header) {
            mergedConfig.logging.proxy_header = config.logging.proxy_header;
        }
    }

    if (config.filtering.enabled === true) {
        mergedConfig.filtering = {
            enabled: true,
            tcp: config.filtering.tcp ?? true,
            udp: config.filtering.udp ?? false,
            tls: config.filtering.tls ?? true,
            direct_ip: config.filtering.direct_ip ?? false,
            private_ip: config.filtering.private_ip ?? false,
            loopback_ip: config.filtering.loopback_ip ?? false,
            ports: config.filtering.ports ? {
                type: config.filtering.ports.type,
                list: config.filtering.ports.list
            } : {
                type: 'whitelist',
                list: [80, 443]
            },
            hosts: config.filtering.hosts ? {
                type: config.filtering.hosts.type,
                list: config.filtering.hosts.list
            } : {
                type: 'blacklist',
                list: []
            }
        };
    }

    return mergedConfig;
}
