import "dotenv/config";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "fs/promises";
import path from "path";
import WebSocket from "ws";

const SESSION_FILE = path.resolve(process.cwd(), ".cli_session.json");
const rl = readline.createInterface({ input, output });
const WS_URL = process.env.WS_URL || "ws://localhost:5500";
const TIMEOUT_MS = 8000;

async function getSession() {
    try {
        const txt = await fs.readFile(SESSION_FILE, "utf8");
        return JSON.parse(txt);
    } catch (e) {
        return null;
    }
}
async function setSession(obj) {
    await fs.writeFile(SESSION_FILE, JSON.stringify(obj, null, 2), "utf8");
}
async function clearSession() {
    try {
        await fs.unlink(SESSION_FILE);
    } catch (e) {}
}

function prompt(promptText, defaultValue) {
    return rl.question(
        `${promptText}${defaultValue ? ` (${defaultValue})` : ""}: `,
    );
}

function createWsClient(url) {
    const ws = new WebSocket(url);
    const pending = new Map();
    let client = null;

    ws.on("message", (data) => {
        let msg;
        try {
            msg = JSON.parse(data.toString());
        } catch {
            return;
        }
        if (msg && msg.id && pending.has(msg.id)) {
            const p = pending.get(msg.id);
            clearTimeout(p.timer);
            pending.delete(msg.id);
            p.resolve(msg);
            return;
        }
        if (msg && msg.event) {
            try {
                if (client && typeof client.onPush === "function") {
                    client.onPush(msg);
                } else if (msg.event === "message") {
                    const m = msg.message;
                    const when = m.createdAt || m.created_at || "";
                    console.log(
                        `[${when}] ${m.sender?.username || m.senderId || "unknown"}: ${m.content}`,
                    );
                }
            } catch (e) {}
        }
    });

    function sendRequest(command, body = {}) {
        return new Promise((resolve, reject) => {
            if (ws.readyState !== WebSocket.OPEN)
                return reject(new Error("WebSocket not open"));
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const payload = { id, command, body };
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error("timeout"));
            }, TIMEOUT_MS);
            pending.set(id, { resolve, reject, timer });
            ws.send(JSON.stringify(payload));
        });
    }

    function close() {
        try {
            ws.close();
        } catch (e) {}
    }

    client = {
        ws,
        sendRequest,
        close,
        ready: () => ws.readyState === WebSocket.OPEN,
        onPush: null,
    };

    return client;
}

async function ensureConnected(client) {
    if (client.ready()) return;
    await new Promise((resolve, reject) => {
        const ws = client.ws;
        const t = setTimeout(
            () => reject(new Error("WS connect timeout")),
            TIMEOUT_MS,
        );
        ws.on("open", () => {
            clearTimeout(t);
            resolve();
        });
        ws.on("error", (e) => {
            clearTimeout(t);
            reject(e);
        });
    });
}

async function registerInteractive(client) {
    const username = await prompt("username");
    const email = await prompt("email");
    const password = await prompt("password");
    const name = await prompt("name");
    if (!username || !email || !password || !name) {
        console.error("username,email,password required");
        return null;
    }
    const res = await client.sendRequest("register", {
        username,
        email,
        password,
        name,
    });
    if (res.status === "success" && res.user) {
        await setSession({ userId: res.user.id, username: res.user.username });
        console.log("Registered and logged in as", res.user.username);
        return res.user;
    }
    console.error("Register failed:", res.message || JSON.stringify(res));
    return null;
}

async function loginInteractive(client) {
    const identifier = await prompt("username or email");
    const password = await prompt("password");
    if (!identifier || !password) return null;
    const res = await client.sendRequest("login", { identifier, password });
    if (res.status === "success" && res.user) {
        await setSession({ userId: res.user.id, username: res.user.username });
        console.log("Logged in as", res.user.username);
        return res.user;
    }
    console.error("Login failed:", res.message || JSON.stringify(res));
    return null;
}

async function ensureLoggedIn(client) {
    const s = await getSession();
    if (s && s.userId) return s;
    console.log("No user logged in. Choose create (c) or login (l)");
    const choice = (await prompt("Create or Login (c/l)", "c")).toLowerCase();
    if (choice.startsWith("c")) return await registerInteractive(client);
    return await loginInteractive(client);
}

async function createRoom(client, session) {
    const name = await prompt("room name", "");
    const res = await client.sendRequest("createRoom", { roomname: name });
    if (res.status === "success" && res.room) {
        console.log("Room created:", res.room);
        await client.sendRequest("joinRoom", { roomcode: res.room.code });
        const s = (await getSession()) || {};
        s.currentRoom = {
            id: res.room.id,
            code: res.room.code,
            name: res.room.name,
        };
        await setSession(s);
        return res.room;
    }
    console.error("Create room failed:", res.message || JSON.stringify(res));
    return null;
}

async function joinRoom(client, session) {
    const input = await prompt("room code (6-digit) or id");
    if (!input) return null;
    const payload = /^\d+$/.test(input)
        ? { roomcode: Number(input) }
        : { roomcode: input };
    const res = await client.sendRequest("joinRoom", payload);
    if (res.status === "success" && res.room) {
        console.log("Joined room:", res.room);
        const s = (await getSession()) || {};
        s.currentRoom = {
            id: res.room.id,
            code: res.room.code,
            name: res.room.name,
        };
        await setSession(s);
        return res.room;
    }
    console.error("Join failed:", res.message || JSON.stringify(res));
    return null;
}

async function sendMessageInteractive(client) {
    const session = await getSession();
    if (!session || !session.userId) {
        console.error("not logged in");
        return;
    }
    const room = session.currentRoom || {};
    let target = room.id || room.code;
    if (!target) {
        const input = await prompt("conversation id or code to send to");
        if (!input) return;
        target = input;
    }
    const content = await prompt("message");
    if (!content) return;
    const res = await client.sendRequest("sendMessage", {
        conversationId: target,
        senderId: session.userId,
        content,
    });
    if (res.status === "success") console.log("Message sent");
    else
        console.error(
            "sendMessage failed:",
            res.message || JSON.stringify(res),
        );
}

async function listMessagesInteractive(client) {
    const session = await getSession();
    const room = session && session.currentRoom ? session.currentRoom : null;
    let target = room ? room.id || room.code : null;
    if (!target) {
        const input = await prompt("conversation id or code to list");
        if (!input) return;
        target = input;
    }
    const limit = Number(await prompt("limit", "20")) || 20;
    const res = await client.sendRequest("listMessages", {
        conversationId: target,
        limit,
    });
    if (res.status === "success" && Array.isArray(res.messages)) {
        const msgs = res.messages.reverse();
        for (const m of msgs) {
            const when = m.createdAt || m.created_at || "";
            console.log(
                `[${when}] ${m.sender?.username || m.senderId || "unknown"}: ${m.content}`,
            );
        }
    } else {
        console.error(
            "listMessages failed:",
            res.message || JSON.stringify(res),
        );
    }
}

let _pushWatchingClient = null;

async function startWatch(client) {
    const session = await getSession();
    const room = session && session.currentRoom ? session.currentRoom : null;
    if (!room) {
        console.error("no current room to watch; join-room first");
        return;
    }
    if (_pushWatchingClient) {
        console.log("already watching");
        return;
    }
    console.log("Starting push-based watch on", room);
    client.onPush = (msg) => {
        try {
            if (msg.event !== "message") return;
            const m = msg.message;
            const convId = m.conversationId || m.conversation_id || null;
            if (!convId) return;
            if (
                String(convId) !== String(room.id) &&
                String(convId) !== String(room.code)
            )
                return;
            const when = m.createdAt || m.created_at || "";
            console.log(
                `[${when}] ${m.sender?.username || m.senderId || "unknown"}: ${m.content}`,
            );
        } catch (e) {}
    };
    _pushWatchingClient = client;
}
function stopWatch() {
    if (_pushWatchingClient) {
        _pushWatchingClient.onPush = null;
        _pushWatchingClient = null;
        console.log("Stopped push watch");
    }
}

async function main() {
    const client = createWsClient(WS_URL);
    try {
        await ensureConnected(client);
    } catch (e) {
        console.error(
            "Failed to connect to WS:",
            e && e.message ? e.message : e,
        );
        process.exit(1);
    }

    console.log("Chat CLI (ws) connected to", WS_URL);
    console.log(
        "Commands: register, login, create-room, join-room, send, list-messages, watch, stop-watch, whoami, logout, exit",
    );

    while (true) {
        const action = (await prompt("action")).trim();
        if (!action) continue;
        if (action === "exit") break;
        if (action === "whoami") {
            console.log((await getSession()) || "no session");
            continue;
        }
        if (action === "logout") {
            await clearSession();
            console.log("logged out");
            continue;
        }
        if (action === "register") {
            await registerInteractive(client);
            continue;
        }
        if (action === "login") {
            await loginInteractive(client);
            continue;
        }
        if (action === "create-room") {
            const s = await ensureLoggedIn(client);
            if (!s) continue;
            await createRoom(client, s);
            continue;
        }
        if (action === "join-room") {
            const s = await ensureLoggedIn(client);
            if (!s) continue;
            await joinRoom(client, s);
            continue;
        }
        if (action === "send") {
            await sendMessageInteractive(client);
            continue;
        }
        if (action === "list-messages") {
            await listMessagesInteractive(client);
            continue;
        }
        if (action === "watch") {
            await startWatch(client);
            continue;
        }
        if (action === "stop-watch") {
            stopWatch();
            continue;
        }
        console.log("unknown action");
    }

    client.close();
    rl.close();
    process.exit(0);
}

main();
