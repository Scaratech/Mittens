export const CLOSE_REASONS = {
    0x01: " Reason unspecified or unknown. Returning a more specific reason should be preferred.",
    0x02: "Voluntary stream closure, which would equate to one side resetting the connection.",
    0x03: "Unexpected stream closure due to a network error.",
    0x04: "Incompatible extensions. This will only be used during the initial handshake.",
    0x41: "Stream creation failed due to invalid information. This could be sent if the destination was a reserved address or the port is invalid.",
    0x42: "Stream creation failed due to an unreachable destination host. This could be sent if the destination is an domain which does not resolve to anything.",
    0x43: "Stream creation timed out due to the destination server not responding.",
    0x44: "Stream creation failed due to the destination server refusing the connection.",
    0x47: "TCP data transfer timed out.",
    0x48: "Stream destination address/domain is intentionally blocked by the proxy server.",
    0x49: "Connection throttled by the server.",
    0x81: "The client has encountered an unexpected error and is unable to receive any more data.",
    0xc0: "Authentication failed due to invalid username/password.",
    0xc1: "Authentication failed due to invalid signature.",
    0xc2: "Authentication required but the client did not provide credentials."
};

export enum PacketType {
    CONNECT = 0x01,
    DATA = 0x02,
    CONTINUE = 0x03,
    CLOSE = 0x04,
    INFO = 0x05
};

export enum ConnectType {
    TCP = 0x01,
    UDP = 0x02
};

export enum ExtensionID {
    UDP = 0x01,
    PASSWORD_AUTH = 0x02,
    KEY_AUTH = 0x03,
    SERVER_MOTD = 0x04,
    STREAM_OPEN_CONFIRMATION = 0x05
};

export enum SignatureAlgorithm {
    ED25519 = 0b00000001
};

export type CloseReason = keyof typeof CLOSE_REASONS;

export interface ConnectPacket {
    type: ConnectType;
    port: number; // uint16
    host: string; // UTF-8
};

export interface DataPacket {
    payload: string; // base64
};

export interface ContinuePacket {
    remaining: number; // uint32
};

export interface ClosePacket {
    reason: CloseReason;
};

export interface BaseExtensionMetadata {
    id: ExtensionID;
    payloadLength: number; // uint32
};

export interface UDPExtensionMetadata extends BaseExtensionMetadata {
    id: ExtensionID.UDP;
};

export interface PasswordAuthServerMetadata extends BaseExtensionMetadata {
    id: ExtensionID.PASSWORD_AUTH;
    required: boolean; // uint8
};

export interface PasswordAuthClientMetadata extends BaseExtensionMetadata {
    id: ExtensionID.PASSWORD_AUTH;
    usernameLength: number; // uint8
    username: string; // UTF-8
    password: string; // UTF-8
};

export type PasswordAuthMetadata = PasswordAuthServerMetadata | PasswordAuthClientMetadata;

export interface KeyAuthRecievedMetadata extends BaseExtensionMetadata {
    id: ExtensionID.KEY_AUTH;
    required: boolean; // uint8
    supportedAlgorithms: number; // uint8
    challengeData: string;
};

export interface KeyAuthSentMetadata extends BaseExtensionMetadata {
    id: ExtensionID.KEY_AUTH;
    selectedAlgorithm: number; // uint8
    publicKeyHash: string; // char[32] (sha-256)
    challengeSignature: string;
};

export type KeyAuthMetadata = KeyAuthRecievedMetadata | KeyAuthSentMetadata;

export interface ServerMOTDMetadata extends BaseExtensionMetadata {
    id: ExtensionID.SERVER_MOTD;
    motd: string; // UTF-8
};

export interface StreamOpenConfirmationMetadata extends BaseExtensionMetadata {
    id: ExtensionID.STREAM_OPEN_CONFIRMATION;
};

export type ExtensionMetadata = 
    | UDPExtensionMetadata 
    | PasswordAuthMetadata 
    | KeyAuthMetadata 
    | ServerMOTDMetadata 
    | StreamOpenConfirmationMetadata;

export interface InfoPacket {
    majorWispVersion: number; // uint8
    minorWispVersion: number; // uint8
    extensions: ExtensionMetadata[];
};

export type PacketPayload = ConnectPacket | DataPacket | ContinuePacket | ClosePacket | InfoPacket;
export type StreamID = number; // uint32 (little-endian)

export interface Packet {
    type: PacketType;
    streamId: StreamID;
    payload: PacketPayload;
};

export type ProxyHeader = 'X-Forwarded-For' | 'X-Real-IP' | 'CF-Connecting-IP';
export type LogActions = 'connection' | 'error' | 'CONNECT' | 'DATA' | 'blocked' | 'wispguardBlocked' | '*';
export type LogType = 'log' | 'json';
export type FilterType = 'whitelist' | 'blacklist';

export interface Config {
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
    /** Wispguard configuration */
    wispguard: {
        enabled: boolean;
        ip?: {
            type: FilterType;
            list: string[];
        };
        ua?: {
            type: FilterType;
            list: string[];
        };
        host?: {
            type: FilterType;
            list: string[];
        }
    }
    /** Filter configuration */
    filtering: {
        /** Filtering status */
        enabled: boolean;
        /** Allow TCP connections */
        tcp?: boolean;
        /** Allow UDP connections */
        udp?: boolean;
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
