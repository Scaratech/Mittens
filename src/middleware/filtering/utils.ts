import { ConnectType, type Config } from "../../types.js";
import ipaddr from 'ipaddr.js';

export function isIPv4(hostOrIp: string): boolean {
    return ipaddr.IPv4.isValid(hostOrIp);
}

export function isIPv6(hostOrIp: string): boolean {
    return ipaddr.IPv6.isValid(hostOrIp);
}

export function isIP(hostOrIp: string): boolean {
    return ipaddr.isValid(hostOrIp);
}

export function isPrivate(hostOrIp: string): boolean {
    if (!ipaddr.isValid(hostOrIp)) return false;

    const addr = ipaddr.parse(hostOrIp);
    const range = addr.range();
    let ranges = ['broadcast', 'linkLocal', 'carrierGradeNat', 'private', 'reserved'];

    if (ranges.includes(range)) {
        return true;
    } else {
        return false;
    }
}

export function isLoopback(hostOrIp: string): boolean {
    if (!ipaddr.isValid(hostOrIp)) return false;

    const addr = ipaddr.parse(hostOrIp);
    const range = addr.range();
    let ranges = ['loopback', 'multicast', 'unspecified'];

    if (ranges.includes(range)) {
        return true;
    } else {
        return false;
    }
}

export function isDomain(hostOrIp: string): boolean {
    return !isIP(hostOrIp);
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

