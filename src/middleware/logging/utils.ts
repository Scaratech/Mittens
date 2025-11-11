import type { Config } from "../../types.js";
import type { IncomingMessage } from "node:http";

export function getIP(config: Config, req: IncomingMessage): string {
    let ip: string;

    if (config.logging.trust_proxy === true) {
        const header = config.logging?.proxy_header;
        
        if (header === 'X-Forwarded-For') {
            const forwardedFor = req.headers['x-forwarded-for'];

            if (typeof forwardedFor === 'string') {
                ip = forwardedFor.split(',')[0].trim();
            } else if (
                Array.isArray(forwardedFor) && 
                forwardedFor.length > 0
            ) {
                ip = forwardedFor[0].split(',')[0].trim();
            } else {
                ip = req.socket.remoteAddress || 
                    req.socket.remoteAddress || 
                    'unknown';
            }
        } else if (header === 'X-Real-IP') {
            ip = req.headers['x-real-ip'] as string || 
                req.socket.remoteAddress || 
                'unknown';
        } else if (header === 'CF-Connecting-IP') {
            ip = req.headers['cf-connecting-ip'] as string || 
                req.socket.remoteAddress || 
                'unknown';
        }
    } else {
        ip = req.socket.remoteAddress || 'unknown';
    }

    return ip;
}
