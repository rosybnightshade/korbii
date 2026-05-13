import prisma from "../db.js";
import crypto from "crypto";

const HASH_ITERATIONS = 100000;
const KEYLEN = 64;
const DIGEST = "sha512";

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
        .pbkdf2Sync(password, salt, HASH_ITERATIONS, KEYLEN, DIGEST)
        .toString("hex");
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    if (!stored) return false;
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const attempt = crypto
        .pbkdf2Sync(password, salt, HASH_ITERATIONS, KEYLEN, DIGEST)
        .toString("hex");
    try {
        return crypto.timingSafeEqual(
            Buffer.from(attempt, "hex"),
            Buffer.from(hash, "hex"),
        );
    } catch (e) {
        return false;
    }
}

export async function registerUser(ws, payload) {
    try {
        const { id } = payload || {};
        const { username, email, password, name, ipAddress, port } =
            payload || {};
        if (!username || !email || !password) {
            const resp = {
                status: "failed",
                message: "username, email and password required",
            };
            if (id) resp.id = id;
            ws.send(JSON.stringify(resp));
            return null;
        }

        const exists = await prisma.user.findFirst({
            where: { OR: [{ username }, { email }] },
        });
        if (exists) {
            const resp = {
                status: "failed",
                message: "username or email already in use",
            };
            if (id) resp.id = id;
            ws.send(JSON.stringify(resp));
            return null;
        }

        const hashed = hashPassword(password);
        const user = await prisma.user.create({
            data: {
                username,
                email,
                password: hashed,
                name: name || null,
                ipAddress: ipAddress || null,
                port: port || null,
            },
            select: {
                id: true,
                username: true,
                email: true,
                name: true,
                ipAddress: true,
                port: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        const resp = { status: "success", user };
        if (id) resp.id = id;
        ws.send(JSON.stringify(resp));
        return user;
    } catch (e) {
        console.error("Register error:", e);
        const resp = { status: "failed", message: e.message };
        if (payload && payload.id) resp.id = payload.id;
        ws.send(JSON.stringify(resp));
        throw e;
    }
}

export async function loginUser(ws, payload) {
    try {
        const { id } = payload || {};
        const { identifier, password, ipAddress, port } = payload || {};
        if (!identifier || !password) {
            const resp = {
                status: "failed",
                message: "identifier and password required",
            };
            if (id) resp.id = id;
            ws.send(JSON.stringify(resp));
            return null;
        }

        const user = await prisma.user.findFirst({
            where: { OR: [{ username: identifier }, { email: identifier }] },
        });
        if (!user) {
            const resp = { status: "failed", message: "invalid credentials" };
            if (id) resp.id = id;
            ws.send(JSON.stringify(resp));
            return null;
        }

        if (!verifyPassword(password, user.password)) {
            const resp = { status: "failed", message: "invalid credentials" };
            if (id) resp.id = id;
            ws.send(JSON.stringify(resp));
            return null;
        }

        const updated = await prisma.user.update({
            where: { id: user.id },
            data: {
                ipAddress: ipAddress || user.ipAddress,
                port: port || user.port,
            },
            select: {
                id: true,
                username: true,
                email: true,
                name: true,
                ipAddress: true,
                port: true,
            },
        });

        const resp = { status: "success", user: updated };
        if (id) resp.id = id;
        ws.send(JSON.stringify(resp));
        return updated;
    } catch (e) {
        console.error("Login error:", e);
        const resp = { status: "failed", message: e.message };
        if (payload && payload.id) resp.id = payload.id;
        ws.send(JSON.stringify(resp));
        throw e;
    }
}
