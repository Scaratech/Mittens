import type { Config } from "../../types.js";

export function isIPBlocked(ip: string, config: Config): boolean {
    if (!config.wispguard || !config.wispguard.enabled) return false;

    const ipConfig = config.wispguard.ip;
    if (!ipConfig) return false;

    const isListed = ipConfig.list.includes(ip);

    if (ipConfig.type === 'blacklist') {
        return isListed;
    } else if (ipConfig.type === 'whitelist') {
        return !isListed;
    }

    return false;
}
export function isUABlocked(ua: string, config: Config): boolean {
    if (!config.wispguard || !config.wispguard.enabled) return false;

    const uaConfig = config.wispguard.ua;
    if (!uaConfig) return false;

    const isListed = uaConfig.list.includes(ua);

    if (uaConfig.type === 'blacklist') {
        return isListed;
    } else if (uaConfig.type === 'whitelist') {
        return !isListed;
    }

    return false;
}
