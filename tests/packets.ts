import {
    rawToFormatted,
    formattedToRaw,
    constructFormatted,
    generateStreamId
} from "../src/utils/packets";
import {
    PacketType,
    ConnectType,
    ConnectPacket,
    DataPacket,
    ContinuePacket,
    ClosePacket
} from "../src/types";

const streamId = generateStreamId();

console.log("Stream ID:", streamId);
console.log();

const connectPacket = constructFormatted({
    type: PacketType.CONNNECT,
    streamId,
    payload: {
        type: ConnectType.TCP,
        port: 443,
        host: "example.com"
    } as ConnectPacket
});

const dataPacket = constructFormatted({
    type: PacketType.DATA,
    streamId,
    payload: {
        payload: Buffer.from("Hello, Wisp!").toString('base64')
    } as DataPacket
});

const continuePacket = constructFormatted({
    type: PacketType.CONTINUE,
    streamId,
    payload: {
        remaining: 1024
    } as ContinuePacket
});

const closePacket = constructFormatted({
    type: PacketType.CLOSE,
    streamId,
    payload: {
        reason: 0x02
    } as ClosePacket
});

console.log("CONNECT Packet:", JSON.stringify(connectPacket, null, 2));
console.log();

console.log("DATA Packet:", JSON.stringify(dataPacket, null, 2));
console.log();

console.log("CONTINUE Packet:", JSON.stringify(continuePacket, null, 2));
console.log();

console.log("CLOSE Packet:", JSON.stringify(closePacket, null, 2));
console.log();

const connectRaw = formattedToRaw(connectPacket);
const dataRaw = formattedToRaw(dataPacket);
const continueRaw = formattedToRaw(continuePacket);
const closeRaw = formattedToRaw(closePacket);

console.log("CONNECT Raw:", Array.from(connectRaw));
console.log("DATA Raw:", Array.from(dataRaw));
console.log("CONTINUE Raw:", Array.from(continueRaw));
console.log("CLOSE Raw:", Array.from(closeRaw));

console.log();

const connectParsed = rawToFormatted(connectRaw);
const dataParsed = rawToFormatted(dataRaw);
const continueParsed = rawToFormatted(continueRaw);
const closeParsed = rawToFormatted(closeRaw);

console.log("CONNECT Parsed:", JSON.stringify(connectParsed, null, 2));
console.log();

console.log("DATA Parsed:", JSON.stringify(dataParsed, null, 2));
console.log();

console.log("CONTINUE Parsed:", JSON.stringify(continueParsed, null, 2));
console.log();

console.log("CLOSE Parsed:", JSON.stringify(closeParsed, null, 2));
console.log();
