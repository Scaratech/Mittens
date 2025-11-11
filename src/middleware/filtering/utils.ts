import { ConnectType, type Config } from "../../types.js";
import ipaddr from 'ipaddr.js';
import { Resolver } from 'node:dns/promises';

const resolver = new Resolver();
resolver.setServers(['1.1.1.1']);

export function isIPv4(host: string): boolean {
    try {
        return ipaddr.IPv4.isValid(host);
    } catch {
        return false;
    }
}

export function isIPv6(host: string): boolean {
    try {
        return ipaddr.IPv6.isValid(host);
    } catch {
        return false;
    }
}

export function isIP(host: string): boolean {
    return ipaddr.isValid(host);
}

export function isPrivateIP(host: string): boolean {
    if (!isIP(host)) return false;

    try {
        const addr = ipaddr.parse(host);
        return addr.range() === 'private';
    } catch {
        return false;
    }
}

export async function isLoopbackIP(host: string): Promise<boolean> {
    if (!host) return false;

    const lower = host.toLowerCase();
    if (lower === 'localhost') return true;
    if (lower.endsWith('.local')) return true;
    if (!lower.includes('.')) return true;

    if (isIP(host)) {
        try {
            const addr = ipaddr.parse(host);
            const r = addr.range();

            if (r === 'loopback') return true;
            if (host === '0.0.0.0') return true;

            return false;

        } catch {
            return false;
        }
    }

    try {
        const addrs = await resolver.resolve(host);
        return !(addrs && addrs.length > 0) ? true : false;
    } catch {
        return true;
    }
}

export function isDomain(host: string): boolean {
    return !isIP(host);
}

export function isPortAllowed(port: number, config: Config): boolean {
    if (!config.filtering.enabled || !config.filtering.ports) return true;
    
    const { type, list } = config.filtering.ports;
    let inList = false;
    
    for (const item of list) {
        if (typeof item === 'number') {
            if (port === item) {
                inList = true;
                break;
            }
        } else {
            const [start, end] = item;

            if (port >= start && port <= end) {
                inList = true;
                break;
            }
        }
    }

    return type === 'whitelist' ? inList : !inList;
}


function matchesPattern(host: string, pattern: string): boolean {
    const regexPattern = pattern
        .replace(/\./g, '\\.')  // Escape dots
        .replace(/\*/g, '.*');   // Convert * to .*
    
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(host);
}

export function isHostAllowed(host: string, config: Config): boolean {
    if (!config.filtering.enabled || !config.filtering.hosts) return true;
    
    const { type, list } = config.filtering.hosts;
    let inList = false;
    
    for (const pattern of list) {
        if (matchesPattern(host, pattern)) {
            inList = true;
            break;
        }
    }

    return type === 'whitelist' ? inList : !inList;
}

export function isTCP(connectType: ConnectType): boolean {
    return connectType === ConnectType.TCP;
}

export function isUDP(connectType: ConnectType): boolean {
    return connectType === ConnectType.UDP;
}

