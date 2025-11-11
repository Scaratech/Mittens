import type { LogActions } from "../../types.js";

export interface LogEntry {
    timestamp: string;
    action: LogActions;
    ip?: string;
    streamId?: number;
    details?: Record<string, any>;
}

export interface LoggerInstance {
    log(entry: LogEntry): void;
    logBlocked?: (packet: any, req?: any, reason?: number, streamId?: number) => void;
    logDataPacket?: (packet: any, req?: any, rawPacket?: any, direction?: 'sent' | 'received') => void;
    logContinuePacket?: (packet: any, req?: any, rawPacket?: any) => void;
    close(): Promise<void>;
}
