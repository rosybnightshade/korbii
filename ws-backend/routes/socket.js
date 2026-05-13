import { WebSocket } from "ws";
import prisma from "../db.js";

export async function createChatServer(ws, payload) {
    try {
        const { id, roomname } = payload || {};
        const newRoom = await prisma.conversation.create({
            data: { name: roomname || null },
        });
        const resp = {
            status: "success",
            room: { id: newRoom.id, name: newRoom.name, code: newRoom.code },
        };
        if (id) resp.id = id;
        ws.send(JSON.stringify(resp));
        return newRoom;
    } catch (e) {
        console.error("Code:", e.code);
        console.error("Message:", e.message);
        const resp = { status: "failed", message: e.message };
        if (payload && payload.id) resp.id = payload.id;
        ws.send(JSON.stringify(resp));
        throw e;
    }
}

export async function joinChatServer(ws, payload) {
    try {
        const { id, roomcode } = payload || {};
        if (!roomcode) {
            const resp = { status: "failed", message: "roomcode required" };
            if (id) resp.id = id;
            ws.send(JSON.stringify(resp));
            return null;
        }

        const room = await prisma.conversation.findUnique({
            where: { code: roomcode },
        });
        if (!room) {
            const resp = { status: "failed", message: "room not found" };
            if (id) resp.id = id;
            ws.send(JSON.stringify(resp));
            return null;
        }

        const resp = {
            status: "success",
            room: { id: room.id, name: room.name, code: room.code },
        };
        if (id) resp.id = id;
        ws.send(JSON.stringify(resp));
        return room;
    } catch (e) {
        console.error("Code:", e.code);
        console.error("Message:", e.message);
        const resp = { status: "failed", message: e.message };
        if (payload && payload.id) resp.id = payload.id;
        ws.send(JSON.stringify(resp));
        throw e;
    }
}

export { registerUser, loginUser } from "./users.js";
