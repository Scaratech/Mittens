import type { Config, ConnectPacket, CloseReason } from "../../types.js";
import {
    isIP,
    isPrivateIP,
    isLoopbackIP,
    isPortAllowed,
    isHostAllowed,
    isTCP,
    isUDP,
    isTLS
} from "./utils.js";

export interface FilterResult {
    allowed: boolean;
    reason?: CloseReason;
}


export function validateConnection(packet: ConnectPacket, config: Config): FilterResult {
    if (!config.filtering.enabled) {
        return { allowed: true };
    }

    const { host, port, type: connectType } = packet;

    if (isTCP(connectType) && config.filtering.tcp === false) {
        return { 
            allowed: false, 
            reason: 0x48
        };
    }

    if (isUDP(connectType) && config.filtering.udp === false) {
        return { 
            allowed: false, 
            reason: 0x48
        };
    }

    if (config.filtering.tls === false && isTLS(port)) {
        return { 
            allowed: false, 
            reason: 0x48
        };
    }

    if (!isPortAllowed(port, config)) {
        return { 
            allowed: false, 
            reason: 0x48
        };
    }

    if (isIP(host)) {
        if (config.filtering.direct_ip === false) {
            return { 
                allowed: false, 
                reason: 0x48
            };
        }

        if (config.filtering.private_ip === false && isPrivateIP(host)) {
            return { 
                allowed: false, 
                reason: 0x48
            };
        }

        if (config.filtering.loopback_ip === false && isLoopbackIP(host)) {
            return { 
                allowed: false, 
                reason: 0x48
            };
        }
    } else {
        if (config.filtering.loopback_ip === false && isLoopbackIP(host)) {
            return { 
                allowed: false, 
                reason: 0x48
            };
        }

        if (!isHostAllowed(host, config)) {
            return { 
                allowed: false, 
                reason: 0x48
            };
        }
    }

    return { allowed: true };
}


export function createFilter(config: Config) {
    return (packet: ConnectPacket): FilterResult => {
        return validateConnection(packet, config);
    };
}
