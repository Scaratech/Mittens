import {
    PacketType,
    ConnectType,
    CloseReason,
    ConnectPacket,
    DataPacket,
    ContinuePacket,
    ClosePacket,
    PacketPayload,
    Packet
} from "../types.js";

/** Convert raw Wisp packet to a formatted object */
function rawToFormatted(raw: Uint8Array): Packet {
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
        
        default:
            throw new Error(`Unknown packet type: 0x${(type as number).toString(16)}`);
    }
    
    return {
        type,
        streamId,
        payload
    };
}

/** Convert formatted object to raw Wisp packet */
function formattedToRaw(packet: Packet): Uint8Array {
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
        
        default:
            throw new Error(`Unknown packet type: 0x${(packet.type as number).toString(16)}`);
    }
    
    // Construct full packet: type (1) + streamId (4) + payload
    const fullPacket = new Uint8Array(5 + payloadSize);
    const view = new DataView(fullPacket.buffer);
    
    view.setUint8(0, packet.type);
    view.setUint32(1, packet.streamId, true);

    fullPacket.set(payloadData, 5);
    
    return fullPacket;
}

/** Create a formatted Wisp packet */
function constructFormatted(options: {
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
function generateStreamId(): number {
    return Math.floor(Math.random() * 0xFFFFFFFE) + 1;
}

export {
    rawToFormatted,
    formattedToRaw,
    constructFormatted,
    generateStreamId
};
