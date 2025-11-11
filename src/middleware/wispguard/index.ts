import type { Config } from "../../types.js";
import type { IncomingMessage } from "node:http";
import { isIPBlocked, isUABlocked } from "./utils.js";
import { getIP } from "../logging/utils.js";

export interface WispguardResult {
    allowed: boolean;
    reason?: 'ip_blocked' | 'ua_blocked';
}

export function validateRequest(config: Config, req: IncomingMessage): WispguardResult {
    if (!config.wispguard || !config.wispguard.enabled) {
        return { allowed: true };
    }

    const ip = getIP(config, req);

    if (isIPBlocked(ip, config)) {
        return {
            allowed: false,
            reason: 'ip_blocked'
        };
    }

    const ua = req.headers['user-agent'] || '';

    if (isUABlocked(ua, config)) {
        return {
            allowed: false,
            reason: 'ua_blocked'
        };
    }

    return { allowed: true };
}
