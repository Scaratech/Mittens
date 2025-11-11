import type { Config, Packet, ConnectPacket, ClosePacket } from "../../types.js";
import type { IncomingMessage } from "node:http";
import type { LogEntry, LoggerInstance } from "./types.js";
import { PacketType, CLOSE_REASONS } from "../../types.js";
import { getIP } from "./utils.js";
import { promises as fs } from "node:fs";
import path from "node:path";

export class Logger implements LoggerInstance {
    private config: Config;
    private stream: fs.FileHandle | null = null;
    private current: string | null = null;
    private queue: LogEntry[] = [];
    private isWriting: boolean = false;
    private allLogs: LogEntry[] = [];

    constructor(config: Config) {
        this.config = config;
        this.initalize();
    }

    private async initalize(): Promise<void> {
        if (!this.config.logging.enabled) return;
        const dir = this.config.logging.log_dir || './logs';
        
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch (err) {
            console.error(`[Mittens] Failed to create log dir:`, err);
            return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const extension = this.config.logging.log_type === 'json' ? 'json' : 'log';
        this.current = path.join(dir, `mittens-${timestamp}.${extension}`);

        try {
            this.stream = await fs.open(this.current, 'a');
        } catch (err) {
            console.error(`[Mittens] Failed to open log file:`, err);
        }
    }

    private shouldLog(action: string): boolean {
        if (!this.config.logging.enabled) return false;     
        const logActions = this.config.logging.log_actions || [];  
        if (logActions.includes('*')) return true;
        return logActions.includes(action as any);
    }

    private async writeToFile(content: string): Promise<void> {
        if (!this.stream) return;

        try {
            await this.stream.write(content + '\n');
        } catch (err) {
            console.error(`[Mittens] Failed to write to log file:`, err);
        }
    }

    private async processQueue(): Promise<void> {
        if (this.isWriting || this.queue.length === 0) return;
        
        this.isWriting = true;

        while (this.queue.length > 0) {
            const entry = this.queue.shift()!;
            
            if (this.config.logging.log_type === 'json') {
                this.allLogs.push(entry);
                const formatted = JSON.stringify({ logs: this.allLogs });
                
                if (this.stream) {
                    await this.stream.close();
                    this.stream = await fs.open(this.current!, 'w');
                    await this.stream.write(formatted);
                }
            } else {
                const formatted = this.formatLogEntry(entry);
                await this.writeToFile(formatted);
            }
        }

        this.isWriting = false;
    }

    private formatLogEntry(entry: LogEntry): string {
        if (this.config.logging.log_type === 'json') {
            this.allLogs.push(entry);
            return JSON.stringify({ logs: this.allLogs });
        }

        let logLine = `[${entry.timestamp}] [${entry.action}]`;
        
        if (entry.ip) {
            logLine += ` IP: ${entry.ip}`;
        }
        
        if (entry.streamId !== undefined) {
            logLine += ` Stream: ${entry.streamId}`;
        }
        
        if (entry.details) {
            const detailsStr = Object.entries(entry.details)
                .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
                .join(', ');
            logLine += ` | ${detailsStr}`;
        }

        return logLine;
    }

    public log(entry: LogEntry): void {
        if (!this.shouldLog(entry.action)) return;

        this.queue.push(entry);
        this.processQueue();
    }

    public async close(): Promise<void> {
        while (this.queue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (this.stream) {
            await this.stream.close();
            this.stream = null;
        }
    }

    public logConnection(req: IncomingMessage): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            action: 'connection'
        };

        if (this.config.logging.log_ip) {
            entry.ip = getIP(this.config, req);
        }

        entry.details = {
            event: 'connected',
            userAgent: req.headers['user-agent'] || 'unknown'
        };

        this.log(entry);

        if (this.shouldLog('*')) {
            const fullEntry: LogEntry = {
                timestamp: new Date().toISOString(),
                action: '*'
            };

            if (this.config.logging.log_ip) {
                fullEntry.ip = getIP(this.config, req);
            }

            fullEntry.details = {
                event: 'connection_established',
                request: {
                    method: req.method,
                    url: req.url,
                    httpVersion: req.httpVersion,
                    headers: req.headers,
                    remoteAddress: req.socket.remoteAddress,
                    remotePort: req.socket.remotePort,
                    localAddress: req.socket.localAddress,
                    localPort: req.socket.localPort,
                    rawHeaders: req.rawHeaders,
                    rawTrailers: req.rawTrailers
                }
            };

            this.log(fullEntry);
        }
    }

    public logDisconnection(req: IncomingMessage): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            action: 'connection'
        };

        if (this.config.logging.log_ip) {
            entry.ip = getIP(this.config, req);
        }

        entry.details = {
            event: 'disconnected'
        };

        this.log(entry);

        if (this.shouldLog('*')) {
            const fullEntry: LogEntry = {
                timestamp: new Date().toISOString(),
                action: '*'
            };

            if (this.config.logging.log_ip) {
                fullEntry.ip = getIP(this.config, req);
            }

            fullEntry.details = {
                event: 'connection_closed',
                request: {
                    method: req.method,
                    url: req.url,
                    httpVersion: req.httpVersion,
                    headers: req.headers,
                    remoteAddress: req.socket.remoteAddress,
                    remotePort: req.socket.remotePort,
                    localAddress: req.socket.localAddress,
                    localPort: req.socket.localPort
                }
            };

            this.log(fullEntry);
        }
    }

    public logPacket(packet: Packet, req?: IncomingMessage, rawPacket?: Buffer): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            action: '*',
            streamId: packet.streamId
        };

        if (req && this.config.logging.log_ip) {
            entry.ip = getIP(this.config, req);
        }

        entry.details = {
            packet: {
                type: PacketType[packet.type],
                typeCode: packet.type,
                streamId: packet.streamId,
                payload: packet.payload
            },
            rawPacket: rawPacket ? {
                hex: rawPacket.toString('hex'),
                base64: rawPacket.toString('base64'),
                length: rawPacket.length,
                bytes: Array.from(rawPacket)
            } : undefined,
            request: req ? {
                method: req.method,
                url: req.url,
                httpVersion: req.httpVersion,
                headers: req.headers,
                remoteAddress: req.socket.remoteAddress,
                remotePort: req.socket.remotePort,
                localAddress: req.socket.localAddress,
                localPort: req.socket.localPort
            } : undefined
        };

        this.log(entry);
    }

    public logConnectPacket(packet: Packet, req?: IncomingMessage, rawPacket?: Buffer): void {
        const payload = packet.payload as ConnectPacket;
        
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            action: 'CONNECT',
            streamId: packet.streamId
        };

        if (req && this.config.logging.log_ip) {
            entry.ip = getIP(this.config, req);
        }

        entry.details = {
            host: payload.host,
            port: payload.port,
            type: payload.type === 0x01 ? 'TCP' : 'UDP'
        };

        this.log(entry);

        if (this.shouldLog('*')) {
            const fullEntry: LogEntry = {
                timestamp: new Date().toISOString(),
                action: '*',
                streamId: packet.streamId
            };

            if (req && this.config.logging.log_ip) {
                fullEntry.ip = getIP(this.config, req);
            }

            fullEntry.details = {
                event: 'CONNECT_packet',
                packet: {
                    type: PacketType[packet.type],
                    typeCode: packet.type,
                    streamId: packet.streamId,
                    payload: payload
                },
                rawPacket: rawPacket ? {
                    hex: rawPacket.toString('hex'),
                    base64: rawPacket.toString('base64'),
                    length: rawPacket.length,
                    bytes: Array.from(rawPacket)
                } : undefined
            };

            this.log(fullEntry);
        }
    }

    public logDataPacket(packet: Packet, req?: IncomingMessage, rawPacket?: Buffer, direction: 'sent' | 'received' = 'sent'): void {
        const payload = packet.payload as any;
        
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            action: 'DATA',
            streamId: packet.streamId
        };

        if (req && this.config.logging.log_ip) {
            entry.ip = getIP(this.config, req);
        }

        const base64Data = payload.payload || '';
        const dataLength = base64Data ? Buffer.from(base64Data, 'base64').length : 0;

        entry.details = {
            direction: direction,
            length: dataLength,
            data: base64Data
        };

        this.log(entry);

        if (this.shouldLog('*')) {
            const fullEntry: LogEntry = {
                timestamp: new Date().toISOString(),
                action: '*',
                streamId: packet.streamId
            };

            if (req && this.config.logging.log_ip) {
                fullEntry.ip = getIP(this.config, req);
            }

            fullEntry.details = {
                event: 'DATA_packet',
                direction: direction,
                packet: {
                    type: PacketType[packet.type],
                    typeCode: packet.type,
                    streamId: packet.streamId,
                    payload: payload
                },
                data: {
                    length: dataLength,
                    base64: base64Data,
                    decoded: base64Data ? Buffer.from(base64Data, 'base64').toString('utf8', 0, Math.min(dataLength, 1000)) : ''
                },
                rawPacket: rawPacket ? {
                    hex: rawPacket.toString('hex'),
                    base64: rawPacket.toString('base64'),
                    length: rawPacket.length,
                    bytes: Array.from(rawPacket)
                } : undefined
            };

            this.log(fullEntry);
        }
    }

    public logContinuePacket(packet: Packet, req?: IncomingMessage, rawPacket?: Buffer): void {
        const payload = packet.payload as any;

        if (this.shouldLog('*')) {
            const fullEntry: LogEntry = {
                timestamp: new Date().toISOString(),
                action: '*',
                streamId: packet.streamId
            };

            if (req && this.config.logging.log_ip) {
                fullEntry.ip = getIP(this.config, req);
            }

            fullEntry.details = {
                event: 'CONTINUE_packet',
                packet: {
                    type: PacketType[packet.type],
                    typeCode: packet.type,
                    streamId: packet.streamId,
                    payload: payload
                },
                bufferRemaining: payload.remaining,
                rawPacket: rawPacket ? {
                    hex: rawPacket.toString('hex'),
                    base64: rawPacket.toString('base64'),
                    length: rawPacket.length,
                    bytes: Array.from(rawPacket)
                } : undefined
            };

            this.log(fullEntry);
        }
    }

    public logClosePacket(packet: Packet, req?: IncomingMessage, rawPacket?: Buffer): void {
        const payload = packet.payload as ClosePacket;
        
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            action: 'error',
            streamId: packet.streamId
        };

        if (req && this.config.logging.log_ip) {
            entry.ip = getIP(this.config, req);
        }

        entry.details = {
            reason: `0x${payload.reason.toString(16).padStart(2, '0').toUpperCase()}`,
            reasonText: CLOSE_REASONS[payload.reason] || 'Unknown reason'
        };

        this.log(entry);

        if (this.shouldLog('*')) {
            const fullEntry: LogEntry = {
                timestamp: new Date().toISOString(),
                action: '*',
                streamId: packet.streamId
            };

            if (req && this.config.logging.log_ip) {
                fullEntry.ip = getIP(this.config, req);
            }

            fullEntry.details = {
                event: 'CLOSE_packet',
                packet: {
                    type: PacketType[packet.type],
                    typeCode: packet.type,
                    streamId: packet.streamId,
                    payload: payload
                },
                reason: {
                    code: `0x${payload.reason.toString(16).padStart(2, '0').toUpperCase()}`,
                    text: CLOSE_REASONS[payload.reason] || 'Unknown reason',
                    numeric: payload.reason
                },
                rawPacket: rawPacket ? {
                    hex: rawPacket.toString('hex'),
                    base64: rawPacket.toString('base64'),
                    length: rawPacket.length,
                    bytes: Array.from(rawPacket)
                } : undefined
            };

            this.log(fullEntry);
        }
    }

    public logBlocked(packet: ConnectPacket, req?: IncomingMessage, reason?: number, streamId?: number): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            action: 'blocked',
            streamId: streamId ?? (packet ? (packet as any).streamId : undefined)
        };

        if (req && this.config.logging.log_ip) {
            entry.ip = getIP(this.config, req);
        }

        entry.details = {
            host: packet.host,
            port: packet.port,
            type: packet.type === 0x01 ? 'TCP' : 'UDP',
            reason: reason !== undefined ? `0x${(reason as number).toString(16).padStart(2, '0').toUpperCase()}` : undefined,
            reasonText: reason !== undefined ? CLOSE_REASONS[reason as any] : undefined
        };

        this.log(entry);

        if (this.shouldLog('*')) {
            const fullEntry: LogEntry = {
                timestamp: new Date().toISOString(),
                action: '*',
                streamId: entry.streamId
            };

            if (req && this.config.logging.log_ip) fullEntry.ip = getIP(this.config, req);

            fullEntry.details = {
                event: 'blocked_connection',
                packet: {
                    host: packet.host,
                    port: packet.port,
                    type: packet.type === 0x01 ? 'TCP' : 'UDP'
                },
                reason: {
                    code: reason !== undefined ? `0x${(reason as number).toString(16).padStart(2, '0').toUpperCase()}` : undefined,
                    text: reason !== undefined ? CLOSE_REASONS[reason as any] : undefined,
                    numeric: reason
                },
                request: req ? {
                    method: req.method,
                    url: req.url,
                    httpVersion: req.httpVersion,
                    headers: req.headers,
                    remoteAddress: req.socket.remoteAddress,
                    remotePort: req.socket.remotePort,
                    localAddress: req.socket.localAddress,
                    localPort: req.socket.localPort
                } : undefined
            };

            this.log(fullEntry);
        }
    }

    public logInfoPacket(packet: Packet, req?: IncomingMessage, rawPacket?: Buffer, direction: 'sent' | 'received' = 'received'): void {
        const payload = packet.payload as any;

        const extensions: any = {
            motd: false,
            motdMessage: '',
            passwordAuth: false,
            keyAuth: false,
            udp: false,
            streamOpenConfirmation: false
        };

        for (const ext of payload.extensions) {
            switch (ext.id) {
                case 0x01: // UDP
                    extensions.udp = true;
                    break;
                case 0x02: // Password Auth
                    extensions.passwordAuth = true;
                    break;
                case 0x03: // Key Auth
                    extensions.keyAuth = true;
                    break;
                case 0x04: // Server MOTD
                    extensions.motd = true;
                    if (ext.motd) {
                        extensions.motdMessage = ext.motd;
                    }
                    break;
                case 0x05: // Stream Open Confirmation
                    extensions.streamOpenConfirmation = true;
                    break;
            }
        }

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            action: 'INFO',
            streamId: packet.streamId
        };

        if (req && this.config.logging.log_ip) {
            entry.ip = getIP(this.config, req);
        }

        entry.details = {
            direction: direction,
            wispVersion: `${payload.majorWispVersion}.${payload.minorWispVersion}`,
            extensions: extensions
        };

        this.log(entry);

        if (this.shouldLog('*')) {
            const fullEntry: LogEntry = {
                timestamp: new Date().toISOString(),
                action: '*',
                streamId: packet.streamId
            };

            if (req && this.config.logging.log_ip) {
                fullEntry.ip = getIP(this.config, req);
            }

            fullEntry.details = {
                event: `INFO_packet_${direction}`,
                direction: direction,
                wispVersion: `${payload.majorWispVersion}.${payload.minorWispVersion}`,
                packet: {
                    type: PacketType[packet.type],
                    typeCode: packet.type,
                    streamId: packet.streamId,
                    payload: payload
                },
                extensions: payload.extensions.map((ext: any) => ({
                    id: ext.id,
                    payloadLength: ext.payloadLength,
                    ...ext
                })),
                rawPacket: rawPacket ? {
                    hex: rawPacket.toString('hex'),
                    base64: rawPacket.toString('base64'),
                    length: rawPacket.length,
                    bytes: Array.from(rawPacket)
                } : undefined
            };

            this.log(fullEntry);
        }
    }

    public logPasswordAuth(username: string, password: string, req?: IncomingMessage): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            action: 'passwordAuth'
        };

        if (req && this.config.logging.log_ip) {
            entry.ip = getIP(this.config, req);
        }

        entry.details = {
            username: username,
            passwordLength: password.length
        };

        this.log(entry);

        if (this.shouldLog('*')) {
            const fullEntry: LogEntry = {
                timestamp: new Date().toISOString(),
                action: '*'
            };

            if (req && this.config.logging.log_ip) {
                fullEntry.ip = getIP(this.config, req);
            }

            fullEntry.details = {
                event: 'password_authentication',
                username: username,
                password: password,
                passwordLength: password.length
            };

            this.log(fullEntry);
        }
    }

    public logKeyAuthServer(algorithms: number, challenge: string, req?: IncomingMessage): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            action: 'keyAuth'
        };

        if (req && this.config.logging.log_ip) {
            entry.ip = getIP(this.config, req);
        }

        entry.details = {
            type: 'challenge_received',
            supportedAlgorithms: algorithms,
            algorithmsBitmask: `0b${algorithms.toString(2).padStart(8, '0')}`,
            challengeLength: challenge.length
        };

        this.log(entry);

        if (this.shouldLog('*')) {
            const fullEntry: LogEntry = {
                timestamp: new Date().toISOString(),
                action: '*'
            };

            if (req && this.config.logging.log_ip) {
                fullEntry.ip = getIP(this.config, req);
            }

            fullEntry.details = {
                event: 'key_auth_challenge_received',
                supportedAlgorithms: algorithms,
                algorithmsBitmask: `0b${algorithms.toString(2).padStart(8, '0')}`,
                challengeData: challenge,
                challengeLength: challenge.length
            };

            this.log(fullEntry);
        }
    }

    public logKeyAuthClient(algorithm: number, publicKeyHash: string, signature: string, req?: IncomingMessage): void {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            action: 'keyAuth'
        };

        if (req && this.config.logging.log_ip) {
            entry.ip = getIP(this.config, req);
        }

        entry.details = {
            type: 'response_sent',
            selectedAlgorithm: algorithm,
            algorithmBitmask: `0b${algorithm.toString(2).padStart(8, '0')}`,
            publicKeyHashLength: publicKeyHash.length,
            signatureLength: signature.length
        };

        this.log(entry);

        if (this.shouldLog('*')) {
            const fullEntry: LogEntry = {
                timestamp: new Date().toISOString(),
                action: '*'
            };

            if (req && this.config.logging.log_ip) {
                fullEntry.ip = getIP(this.config, req);
            }

            fullEntry.details = {
                event: 'key_auth_response_sent',
                selectedAlgorithm: algorithm,
                algorithmBitmask: `0b${algorithm.toString(2).padStart(8, '0')}`,
                publicKeyHash: publicKeyHash,
                publicKeyHashLength: publicKeyHash.length,
                challengeSignature: signature,
                signatureLength: signature.length
            };

            this.log(fullEntry);
        }
    }

    public logWispVersion(version: { major: number; minor: number }, extensions: any[], req?: IncomingMessage): void {
        if (this.shouldLog('*')) {
            const entry: LogEntry = {
                timestamp: new Date().toISOString(),
                action: '*'
            };

            if (req && this.config.logging.log_ip) {
                entry.ip = getIP(this.config, req);
            }

            entry.details = {
                event: 'wisp_version_detected',
                version: `${version.major}.${version.minor}`,
                majorVersion: version.major,
                minorVersion: version.minor,
                extensions: extensions.map((ext: any) => ({
                    id: ext.id,
                    payloadLength: ext.payloadLength,
                    details: ext
                })),
                extensionCount: extensions.length
            };

            this.log(entry);
        }
    }
}


export function createLogger(config: Config): Logger {
    return new Logger(config);
}
