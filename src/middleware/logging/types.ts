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
    close(): Promise<void>;
}
