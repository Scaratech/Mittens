import { 
    ConnectPacket, 
    ContinuePacket, 
    DataPacket, 
    StreamID, 
    Packet, 
    PacketType, 
    ClosePacket 
} from "./types.js";

export function onConnection(
    callback: (ip: string) => void
) {

}

export function onPacket(
    callback: (packet: Packet) => void | Packet
) {

}

export function onConnectPacket(
    callback: (packet: {
        type: PacketType.CONNNECT,
        streamId: StreamID,
        payload: ConnectPacket
    }) => void | Packet
) {

}

export function onDataPacket(
    callback: (packet: {
        type: PacketType.DATA,
        streamId: StreamID,
        payload: DataPacket
    }) => void | Packet
) {

}

export function onContinuePacket(
    callback: (packet: {
        type: PacketType.CONTINUE,
        streamId: StreamID,
        payload: ContinuePacket
    }) => void | Packet
) {

}

export function onClosePacket(
    callback: (packet: {
        type: PacketType.CLOSE,
        streamId: StreamID,
        payload: ClosePacket
    }) => void | Packet
) {

}