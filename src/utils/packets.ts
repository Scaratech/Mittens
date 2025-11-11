import {
    PacketType,
    ConnectType,
    CloseReason,
    ExtensionID,
    ConnectPacket,
    DataPacket,
    ContinuePacket,
    ClosePacket,
    InfoPacket,
    ExtensionMetadata,
    UDPExtensionMetadata,
    PasswordAuthServerMetadata,
    PasswordAuthClientMetadata,
    KeyAuthRecievedMetadata,
    KeyAuthSentMetadata,
    ServerMOTDMetadata,
    StreamOpenConfirmationMetadata,
    PacketPayload,
    Packet,
    SignatureAlgorithm
} from "../types.js";

const SIGNATURE_LENGTHS: Record<number, number> = {
    [SignatureAlgorithm.ED25519]: 64
};

function getExpectedSignatureLength(selectedAlgorithm: number): number | null {
    if (selectedAlgorithm === 0) {
        return null;
    }

    if ((selectedAlgorithm & (selectedAlgorithm - 1)) !== 0) {
        return null;
    }

    return SIGNATURE_LENGTHS[selectedAlgorithm] ?? null;
}

export function parseExtensions(raw: Uint8Array): ExtensionMetadata[] {
    const extensions: ExtensionMetadata[] = [];
    let offset = 0;

    while (offset < raw.length) {
        if (offset + 5 > raw.length) {
            throw new Error("Extension metadata too short");
        }

        const dataView = new DataView(raw.buffer, raw.byteOffset + offset, raw.byteLength - offset);
        const extensionId = dataView.getUint8(0) as ExtensionID;
        const payloadLength = dataView.getUint32(1, true);

        if (offset + 5 + payloadLength > raw.length) {
            throw new Error("Extension payload exceeds packet length");
        }

        const payloadBytes = raw.slice(offset + 5, offset + 5 + payloadLength);
        const payloadView = new DataView(payloadBytes.buffer, payloadBytes.byteOffset, payloadBytes.byteLength);

        switch (extensionId) {
            case ExtensionID.UDP: {
                extensions.push({
                    id: ExtensionID.UDP,
                    payloadLength
                } as UDPExtensionMetadata);
                break;
            }

            case ExtensionID.PASSWORD_AUTH: {
                if (payloadLength === 1) {
                    const required = payloadView.getUint8(0) !== 0;

                    extensions.push({
                        id: ExtensionID.PASSWORD_AUTH,
                        payloadLength,
                        required
                    } as PasswordAuthServerMetadata);
                } else {
                    const usernameLength = payloadView.getUint8(0);
                    const username = new TextDecoder().decode(payloadBytes.slice(1, 1 + usernameLength));
                    const password = new TextDecoder().decode(payloadBytes.slice(1 + usernameLength));

                    extensions.push({
                        id: ExtensionID.PASSWORD_AUTH,
                        payloadLength,
                        usernameLength,
                        username,
                        password
                    } as PasswordAuthClientMetadata);
                }
                break;
            }

            case ExtensionID.KEY_AUTH: {
                if (payloadLength < 2 || payloadBytes.length < 2) {
                    break;
                }

                const requiredOrAlgorithm = payloadView.getUint8(0);
                const secondByte = payloadView.getUint8(1);

                const publicKeyHashBytes = payloadBytes.slice(1, 33);
                const signatureBytes = payloadBytes.slice(33);

                const expectedSignatureLength = getExpectedSignatureLength(requiredOrAlgorithm);
                const looksLikeClientPayload =
                    publicKeyHashBytes.length === 32 &&
                    expectedSignatureLength !== null &&
                    signatureBytes.length === expectedSignatureLength;

                if (looksLikeClientPayload) {
                    const selectedAlgorithm = requiredOrAlgorithm;
                    const publicKeyHash = Buffer.from(publicKeyHashBytes).toString('hex');
                    const challengeSignature = Buffer.from(signatureBytes).toString('hex');

                    extensions.push({
                        id: ExtensionID.KEY_AUTH,
                        payloadLength,
                        selectedAlgorithm,
                        publicKeyHash,
                        challengeSignature
                    } as KeyAuthSentMetadata);
                } else {
                    const required = requiredOrAlgorithm !== 0;
                    const supportedAlgorithms = secondByte;
                    const challengeData = Buffer.from(payloadBytes.slice(2)).toString('hex');

                    extensions.push({
                        id: ExtensionID.KEY_AUTH,
                        payloadLength,
                        required,
                        supportedAlgorithms,
                        challengeData
                    } as KeyAuthRecievedMetadata);
                }
                break;
            }

            case ExtensionID.SERVER_MOTD: {
                const motd = new TextDecoder().decode(payloadBytes);

                extensions.push({
                    id: ExtensionID.SERVER_MOTD,
                    payloadLength,
                    motd
                } as ServerMOTDMetadata);
                break;
            }

            case ExtensionID.STREAM_OPEN_CONFIRMATION: {
                extensions.push({
                    id: ExtensionID.STREAM_OPEN_CONFIRMATION,
                    payloadLength
                } as StreamOpenConfirmationMetadata);
                break;
            }

            default:
                break;
        }

        offset += 5 + payloadLength;
    }

    return extensions;
}

export function rawToFormatted(raw: Uint8Array): Packet {
    if (raw.length < 5) {
        throw new Error("Packet too short");
    }

    const dataView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    
    const type = dataView.getUint8(0) as PacketType;
    const streamId = dataView.getUint32(1, true);
    let payload: PacketPayload;
    
    switch (type) {
        case PacketType.CONNECT: {
            if (raw.length < 8) {
                throw new Error("CONNECT packet too short");
            }

            const connectType = dataView.getUint8(5) as ConnectType;
            const port = dataView.getUint16(6, true);
            const hostBytes = raw.slice(8);
            const host = new TextDecoder().decode(hostBytes);
            
            payload = {
                type: connectType,
                port,
                host
            } as ConnectPacket;

            break;
        }
        
        case PacketType.DATA: {
            const payloadBytes = raw.slice(5);
            const payloadStr = Buffer.from(payloadBytes).toString('base64');
            
            payload = {
                payload: payloadStr
            } as DataPacket;

            break;
        }
        
        case PacketType.CONTINUE: {
            if (raw.length < 9) {
                throw new Error("CONTINUE packet too short");
            }

            const remaining = dataView.getUint32(5, true);
            
            payload = {
                remaining
            } as ContinuePacket;

            break;
        }
        
        case PacketType.CLOSE: {
            if (raw.length < 6) {
                throw new Error("CLOSE packet too short");
            }

            const reason = dataView.getUint8(5) as CloseReason;
            
            payload = {
                reason
            } as ClosePacket;

            break;
        }

        case PacketType.INFO: {
            if (raw.length < 7) {
                throw new Error("INFO packet too short");
            }

            const majorWispVersion = dataView.getUint8(5);
            const minorWispVersion = dataView.getUint8(6);
            const extensionBytes = raw.slice(7);
            const extensions = parseExtensions(extensionBytes);

            payload = {
                majorWispVersion,
                minorWispVersion,
                extensions
            } as InfoPacket;

            break;
        }
        
        default:
            throw new Error(`Unknown packet type: 0x${(type as number).toString(16)}`);
    }
    
    return {
        type,
        streamId,
        payload
    };
}

export function serializeExtensions(extensions: ExtensionMetadata[]): Uint8Array {
    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    for (const ext of extensions) {
        let extPayload: Uint8Array;

        switch (ext.id) {
            case ExtensionID.UDP: {
                extPayload = new Uint8Array(0);
                break;
            }

            case ExtensionID.PASSWORD_AUTH: {
                if ('required' in ext) {
                    extPayload = new Uint8Array(1);
                    extPayload[0] = ext.required ? 1 : 0;
                } else {
                    const usernameBytes = new TextEncoder().encode(ext.username);
                    const passwordBytes = new TextEncoder().encode(ext.password);

                    extPayload = new Uint8Array(1 + usernameBytes.length + passwordBytes.length);
                    extPayload[0] = usernameBytes.length;

                    extPayload.set(usernameBytes, 1);
                    extPayload.set(passwordBytes, 1 + usernameBytes.length);
                }
                break;
            }

            case ExtensionID.KEY_AUTH: {
                if ('supportedAlgorithms' in ext) {
                    const challengeBytes = Buffer.from(ext.challengeData, 'hex');

                    extPayload = new Uint8Array(2 + challengeBytes.length);

                    extPayload[0] = ext.required ? 1 : 0;
                    extPayload[1] = ext.supportedAlgorithms;

                    extPayload.set(challengeBytes, 2);
                } else {
                    const publicKeyHashBytes = Buffer.from(ext.publicKeyHash, 'hex');
                    const challengeSignatureBytes = Buffer.from(ext.challengeSignature, 'hex');

                    extPayload = new Uint8Array(1 + publicKeyHashBytes.length + challengeSignatureBytes.length);

                    extPayload[0] = ext.selectedAlgorithm;

                    extPayload.set(publicKeyHashBytes, 1);
                    extPayload.set(challengeSignatureBytes, 1 + publicKeyHashBytes.length);
                }
                break;
            }

            case ExtensionID.SERVER_MOTD: {
                const motdBytes = new TextEncoder().encode(ext.motd);
                extPayload = motdBytes;
                break;
            }

            case ExtensionID.STREAM_OPEN_CONFIRMATION: {
                extPayload = new Uint8Array(0);
                break;
            }

            default:
                extPayload = new Uint8Array(0);
                break;
        }

        const extChunk = new Uint8Array(5 + extPayload.length);
        const extView = new DataView(extChunk.buffer);

        extView.setUint8(0, ext.id);
        extView.setUint32(1, extPayload.length, true);

        extChunk.set(extPayload, 5);

        chunks.push(extChunk);
        totalSize += extChunk.length;
    }

    const result = new Uint8Array(totalSize);
    let offset = 0;

    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return result;
}

export function formattedToRaw(packet: Packet): Uint8Array {
    let payloadSize = 0;
    let payloadData: Uint8Array;
    
    switch (packet.type) {
        case PacketType.CONNECT: {
            const p = packet.payload as ConnectPacket;
            const hostBytes = new TextEncoder().encode(p.host);

            payloadSize = 1 + 2 + hostBytes.length; // type + port + host
            payloadData = new Uint8Array(payloadSize);

            const view = new DataView(payloadData.buffer);
            view.setUint8(0, p.type);
            view.setUint16(1, p.port, true);

            payloadData.set(hostBytes, 3);

            break;
        }
        
        case PacketType.DATA: {
            const p = packet.payload as DataPacket;
            payloadData = Buffer.from(p.payload, 'base64');
            payloadSize = payloadData.length;

            break;
        }
        
        case PacketType.CONTINUE: {
            const p = packet.payload as ContinuePacket;

            payloadSize = 4; // uint32
            payloadData = new Uint8Array(payloadSize);

            const view = new DataView(payloadData.buffer);
            view.setUint32(0, p.remaining, true);

            break;
        }
        
        case PacketType.CLOSE: {
            const p = packet.payload as ClosePacket;

            payloadSize = 1; // uint8

            payloadData = new Uint8Array(payloadSize);
            payloadData[0] = p.reason as number;

            break;
        }

        case PacketType.INFO: {
            const p = packet.payload as InfoPacket;
            const extensionBytes = serializeExtensions(p.extensions);

            payloadSize = 2 + extensionBytes.length; // major + minor + extensions
            payloadData = new Uint8Array(payloadSize);

            payloadData[0] = p.majorWispVersion;
            payloadData[1] = p.minorWispVersion;
            payloadData.set(extensionBytes, 2);

            break;
        }
        
        default:
            throw new Error(`Unknown packet type: 0x${(packet.type as number).toString(16)}`);
    }
    
    // type (1) + streamId (4) + payload
    const fullPacket = new Uint8Array(5 + payloadSize);
    const view = new DataView(fullPacket.buffer);
    
    view.setUint8(0, packet.type);
    view.setUint32(1, packet.streamId, true);

    fullPacket.set(payloadData, 5);
    
    return fullPacket;
}

/** Create a formatted Wisp packet */
export function constructFormatted(options: {
    type: PacketType;
    streamId: number;
    payload: PacketPayload;
}): Packet {
    return {
        type: options.type,
        streamId: options.streamId,
        payload: options.payload
    };
}

/** Generate a random stream ID (uint32) */
export function generateStreamId(): number {
    return Math.floor(Math.random() * 0xFFFFFFFE) + 1;
}
