import type { Config, ConnectPacket, CloseReason } from "../../types.js";
import {
    isIP,
    isPrivate,
    isLoopback,
    isPortAllowed,
    isHostAllowed,
    isTCP,
    isUDP
} from "./utils.js";
import dns from "node:dns/promises";

export interface FilterResult {
    allowed: boolean;
    reason?: CloseReason;
}

async function resolver(host: string, timeout: number = 1000): Promise<string[]> {
    try {
        const addrs: string[] = [];

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('DNS timeout')), timeout);
        });

        const [v4, v6] = await Promise.race([
            Promise.all([
                dns.resolve4(host).catch(() => []),
                dns.resolve6(host).catch(() => [])
            ]),
            timeoutPromise
        ]);

        addrs.push(...v4, ...v6);
        return addrs;
    } catch {
        return [];
    }
}

export async function validateConnection(packet: ConnectPacket, config: Config): Promise<FilterResult> {
    if (!config.filtering.enabled) return { allowed: true };

    const { host, port, type: connectType } = packet;

    if (isTCP(connectType) && config.filtering.tcp === false)
        return { allowed: false, reason: 0x48 };

    if (isUDP(connectType) && config.filtering.udp === false)
        return { allowed: false, reason: 0x48 };

    if (!isPortAllowed(port, config))
        return { allowed: false, reason: 0x48 };

    if (isIP(host)) {
        if (config.filtering.direct_ip === false)
            return { allowed: false, reason: 0x48 };

        if (config.filtering.private_ip === false && isPrivate(host))
            return { allowed: false, reason: 0x48 };

        if (config.filtering.loopback_ip === false && isLoopback(host))
            return { allowed: false, reason: 0x48 };
    } else {
        if (!isHostAllowed(host, config))
            return { allowed: false, reason: 0x48 };

        if (
            config.filtering.private_ip === false || 
            config.filtering.loopback_ip === false
        ) {
            const ips = await resolver(host);

            if (ips.length > 0) {
                for (const ip of ips) {
                    if (
                        (config.filtering.private_ip === false && isPrivate(ip)) ||
                        (config.filtering.loopback_ip === false && isLoopback(ip))
                    ) {
                        return { allowed: false, reason: 0x48 };
                    }
                }
            }
        }
    }

    return { allowed: true };
}
