import prisma from "../db.js";

async function resolveConversation(identifier) {
    if (!identifier) return null;
    if (typeof identifier === "number" || /^\d+$/.test(String(identifier))) {
        const code = Number(identifier);
        return prisma.conversation.findUnique({ where: { code } });
    }
    return prisma.conversation.findUnique({
        where: { id: String(identifier) },
    });
}


export async function sendMessage(ws, payload) {
    try {
        const { id } = payload || {};
        const { conversationId, senderId, content } = payload || {};
        if (!conversationId || !senderId || !content) {
            const resp = {
                status: "failed",
                message: "conversationId, senderId and content are required",
            };
            if (id) resp.id = id;
            ws.send(JSON.stringify(resp));
            return null;
        }

        const conv = await resolveConversation(conversationId);
        if (!conv) {
            const resp = {
                status: "failed",
                message: "conversation not found",
            };
            if (id) resp.id = id;
            ws.send(JSON.stringify(resp));
            return null;
        }

        const sender = await prisma.user.findUnique({
            where: { id: senderId },
            select: { id: true, username: true },
        });
        if (!sender) {
            const resp = { status: "failed", message: "sender not found" };
            if (id) resp.id = id;
            ws.send(JSON.stringify(resp));
            return null;
        }

        const createData = {
            conversationId: conv.id,
            senderId,
            content,
            type: "TEXT",
        };

        const msg = await prisma.message.create({
            data: createData,
            include: { sender: { select: { id: true, username: true } } },
        });

        const resp = {
            status: "success",
            message: msg,
            conversationId: conv.id,
        };
        if (id) resp.id = id;
        ws.send(JSON.stringify(resp));
        return { ...msg, conversationId: conv.id };
    } catch (e) {
        console.error("sendMessage error:", e);
        const resp = { status: "failed", message: e.message };
        if (payload && payload.id) resp.id = payload.id;
        ws.send(JSON.stringify(resp));
        throw e;
    }
}

export async function listMessages(ws, payload) {
    try {
        const { id } = payload || {};
        const { conversationId, limit = 50 } = payload || {};
        if (!conversationId) {
            const resp = {
                status: "failed",
                message: "conversationId required",
            };
            if (id) resp.id = id;
            ws.send(JSON.stringify(resp));
            return null;
        }

        const conv = await resolveConversation(conversationId);
        if (!conv) {
            const resp = {
                status: "failed",
                message: "conversation not found",
            };
            if (id) resp.id = id;
            ws.send(JSON.stringify(resp));
            return null;
        }

        const messages = await prisma.message.findMany({
            where: { conversationId: conv.id },
            orderBy: { createdAt: "desc" },
            take: Number(limit) || 50,
            include: { sender: { select: { id: true, username: true } } },
        });

        const resp = { status: "success", messages, conversationId: conv.id };
        if (id) resp.id = id;
        ws.send(JSON.stringify(resp));
        return messages;
    } catch (e) {
        console.error("listMessages error:", e);
        const resp = { status: "failed", message: e.message };
        if (payload && payload.id) resp.id = payload.id;
        ws.send(JSON.stringify(resp));
        throw e;
    }
}
