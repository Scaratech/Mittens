import {
    rawToFormatted,
    formattedToRaw,
    constructFormatted,
    generateStreamId
} from "../src/utils/packets.js";
import {
    PacketType,
    ConnectType,
    ExtensionID,
    SignatureAlgorithm,
    ConnectPacket,
    DataPacket,
    ContinuePacket,
    ClosePacket,
    InfoPacket,
    UDPExtensionMetadata,
    PasswordAuthServerMetadata,
    PasswordAuthClientMetadata,
    KeyAuthRecievedMetadata,
    KeyAuthSentMetadata,
    ServerMOTDMetadata,
    StreamOpenConfirmationMetadata
} from "../src/types.js";

const streamId = generateStreamId();

console.log("Stream ID:", streamId);
console.log();

const connectPacket = constructFormatted({
    type: PacketType.CONNECT,
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
        payload: Buffer.from("hello world").toString('base64')
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

const serverInfoPacket = constructFormatted({
    type: PacketType.INFO,
    streamId: 0,
    payload: {
        majorWispVersion: 2,
        minorWispVersion: 0,
        extensions: [
            {
                id: ExtensionID.UDP,
                payloadLength: 0
            } as UDPExtensionMetadata,
            {
                id: ExtensionID.PASSWORD_AUTH,
                payloadLength: 1,
                required: false
            } as PasswordAuthServerMetadata,
            {
                id: ExtensionID.KEY_AUTH,
                payloadLength: 66,
                required: false,
                supportedAlgorithms: SignatureAlgorithm.ED25519,
                challengeData: Buffer.from("a".repeat(64), 'utf-8').toString('hex')
            } as KeyAuthRecievedMetadata,
            {
                id: ExtensionID.SERVER_MOTD,
                payloadLength: 13,
                motd: "hello world"
            } as ServerMOTDMetadata,
            {
                id: ExtensionID.STREAM_OPEN_CONFIRMATION,
                payloadLength: 0
            } as StreamOpenConfirmationMetadata
        ]
    } as InfoPacket
});

console.log("Server INFO Packet:", JSON.stringify(serverInfoPacket, null, 2));
console.log();

const serverInfoRaw = formattedToRaw(serverInfoPacket);
console.log("Server INFO Raw:", Array.from(serverInfoRaw));
console.log();

const serverInfoParsed = rawToFormatted(serverInfoRaw);
console.log("Server INFO Parsed:", JSON.stringify(serverInfoParsed, null, 2));
console.log();

const clientInfoPacket = constructFormatted({
    type: PacketType.INFO,
    streamId: 0,
    payload: {
        majorWispVersion: 2,
        minorWispVersion: 0,
        extensions: [
            {
                id: ExtensionID.UDP,
                payloadLength: 0
            } as UDPExtensionMetadata,
            {
                id: ExtensionID.PASSWORD_AUTH,
                payloadLength: 18,
                usernameLength: 5,
                username: "admin",
                password: "admin"
            } as PasswordAuthClientMetadata,
            {
                id: ExtensionID.STREAM_OPEN_CONFIRMATION,
                payloadLength: 0
            } as StreamOpenConfirmationMetadata
        ]
    } as InfoPacket
});

console.log("Client INFO Packet (Password Auth):", JSON.stringify(clientInfoPacket, null, 2));
console.log();

const clientInfoRaw = formattedToRaw(clientInfoPacket);
console.log("Client INFO Raw:", Array.from(clientInfoRaw));
console.log();

const clientInfoParsed = rawToFormatted(clientInfoRaw);
console.log("Client INFO Parsed:", JSON.stringify(clientInfoParsed, null, 2));
console.log();

const clientKeyAuthPacket = constructFormatted({
    type: PacketType.INFO,
    streamId: 0,
    payload: {
        majorWispVersion: 2,
        minorWispVersion: 0,
        extensions: [
            {
                id: ExtensionID.KEY_AUTH,
                payloadLength: 97,
                selectedAlgorithm: SignatureAlgorithm.ED25519,
                publicKeyHash: Buffer.from("b".repeat(32), 'utf-8').toString('hex'),
                challengeSignature: Buffer.from("c".repeat(64), 'utf-8').toString('hex')
            } as KeyAuthSentMetadata
        ]
    } as InfoPacket
});

console.log("Client INFO Packet (Key Auth):", JSON.stringify(clientKeyAuthPacket, null, 2));
console.log();

const clientKeyAuthRaw = formattedToRaw(clientKeyAuthPacket);
console.log("Client Key Auth Raw:", Array.from(clientKeyAuthRaw));
console.log();

const clientKeyAuthParsed = rawToFormatted(clientKeyAuthRaw);
console.log("Client Key Auth Parsed:", JSON.stringify(clientKeyAuthParsed, null, 2));
console.log();
