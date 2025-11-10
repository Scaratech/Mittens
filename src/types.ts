const CLOSE_REASONS = {
    CLIENT_SERVER: {
        0x01: " Reason unspecified or unknown. Returning a more specific reason should be preferred.",
        0x02: "Voluntary stream closure, which would equate to one side resetting the connection.",
        0x03: "Unexpected stream closure due to a network error."
    },
    SERVER: {
        0x41: "Stream creation failed due to invalid information. This could be sent if the destination was a reserved address or the port is invalid.",
        0x42: "Stream creation failed due to an unreachable destination host. This could be sent if the destination is an domain which does not resolve to anything.",
        0x43: "Stream creation timed out due to the destination server not responding.",
        0x44: "Stream creation failed due to the destination server refusing the connection.",
        0x47: "TCP data transfer timed out.",
        0x48: "Stream destination address/domain is intentionally blocked by the proxy server.",
        0x49: "Connection throttled by the server."
    },
    CLIENT: {
        0x81: "The client has encountered an unexpected error and is unable to receive any more data."
    }
};

enum PacketType {
    CONNECT = 0x01,
    DATA = 0x02,
    CONTINUE = 0x03,
    CLOSE = 0x04
};

enum ConnectType {
    TCP = 0x01,
    UDP = 0x02
};

type CloseReason = 
    keyof typeof CLOSE_REASONS.CLIENT_SERVER | 
    keyof typeof CLOSE_REASONS.SERVER | 
    keyof typeof CLOSE_REASONS.CLIENT;

interface ConnectPacket {
    type: ConnectType;
    port: number; // uint16
    host: string; // UTF-8
};

interface DataPacket {
    payload: string; // base64
};

interface ContinuePacket {
    remaining: number; // uint32
};

interface ClosePacket {
    reason: CloseReason;
};

type PacketPayload = ConnectPacket | DataPacket | ContinuePacket | ClosePacket;
type StreamID = number; // uint32 (little-endian)

interface Packet {
    type: PacketType;
    streamId: StreamID
    payload: PacketPayload;
};

type ProxyHeader = 'X-Forwarded-For' | 'X-Real-IP' | 'CF-Connecting-IP';
type LogActions = 'connection' | 'error' | 'CONNECT' | 'DATA' | '*';
type LogType = 'log' | 'json';
type FilterType = 'whitelist' | 'blacklist';

interface Config {
    /** Wisp server */
    host: string;
    /** Server configuration */
    bind?: {
        /** Interface to bind to */
        host?: string;
        /** Port to bind to */
        port: number;
    };
    /** Logging configuration */
    logging: {
        /** Logging status */
        enabled: boolean;
        /** Log client IP addresses */
        log_ip?: boolean;
        /** Trust reverse proxies */
        trust_proxy?: boolean;
        /** Header to get client IP from */
        proxy_header?: ProxyHeader;
        /** Log file format */
        log_type?: LogType;
        /** Directory to store log files */
        log_dir?: string;
        /** Actions that get logged */
        log_actions?: LogActions[];
    };
    /** Filter configuration */
    filtering: {
        /** Filtering status */
        enabled: boolean;
        /** Allow TCP connections */
        tcp?: boolean;
        /** Allow UDP connections */
        udp?: boolean;
        /** Allow TLS encrypted traffic */
        tls?: boolean;
        /** Port configuration */
        ports?: {
            /** Port filtering type */
            type: FilterType;
            /** List of ports and/or port ranges */
            list: (number | [number, number])[];
        };
        /** Hosts configuration */
        hosts?: {
            /** Host filtering type */
            type: FilterType;
            /** List of hostnames (wildcard support) */
            list: string[];
        };
        /** Direct IP connections */
        direct_ip?: boolean;
        /** Private IP connections */
        private_ip?: boolean;
        /** Loopback IP connections */
        loopback_ip?: boolean;
    };
};

export {
    CLOSE_REASONS,
    PacketType,
    ConnectType,
    CloseReason,
    ConnectPacket,
    DataPacket,
    ContinuePacket,
    ClosePacket,
    PacketPayload,
    StreamID,
    Packet,
    ProxyHeader,
    LogActions,
    LogType,
    FilterType,
    Config
};
