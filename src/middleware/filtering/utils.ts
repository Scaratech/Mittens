import { ConnectType, type Config } from "../../types.js";

export function isIPv4(host: string): boolean {
    const pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = host.match(pattern);
    
    if (!match) return false;
    
    for (let i = 1; i <= 4; i++) {
        const octet = parseInt(match[i], 10);
        if (octet < 0 || octet > 255) return false;
    }
    
    return true;
}


export function isIPv6(host: string): boolean {
    const pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    return pattern.test(host);
}

export function isIP(host: string): boolean {
    return isIPv4(host) || isIPv6(host);
}

export function isPrivateIP(host: string): boolean {
    if (!isIPv4(host)) return false;
    
    const parts = host.split('.').map(p => parseInt(p, 10));
    
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    
    // 169.254.0.0/16 (link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
    
    return false;
}

export function isLoopbackIP(host: string): boolean {
    if (host === 'localhost') return true;
    if (host.split('.')[1]?.endsWith('local')) return true;

    if (isIPv4(host)) {
        // 127.0.0.0/8
        const parts = host.split('.').map(p => parseInt(p, 10));
        return parts[0] === 127 || host === '0.0.0.0';
    }
    
    if (isIPv6(host)) {
        return host === '::1' || host === '0:0:0:0:0:0:0:1';
    }
    
    return false;
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

// TODO: Real TLS detection
export function isTLS(port: number): boolean {
    const tlsPorts = [443, 8443, 9443];
    return tlsPorts.includes(port);
}
