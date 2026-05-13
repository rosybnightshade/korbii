import WebSocket from "ws";

const URL = process.env.WS_URL || "ws://localhost:5500";
const TIMEOUT_MS = 8000;

console.log("Testing WebSocket server at", URL);

const ws = new WebSocket(URL);
const pending = new Map();

function sendRequest(command, body = {}) {
    return new Promise((resolve, reject) => {
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

ws.on("open", async () => {
    console.log("WebSocket open, running sequence");
    try {
        // register
        const username = `testuser_${Math.floor(Math.random() * 10000)}`;
        const email = `${username}@example.test`;
        console.log("Registering", username);
        const reg = await sendRequest("register", {
            username,
            email,
            password: "password123",
            name: username
        });
        console.log("Register response:", reg);
        if (reg.status === "failed")
            throw new Error("register failed: " + reg.message);

        // login
        console.log("Logging in as", username);
        const login = await sendRequest("login", {
            identifier: username,
            password: "password123",
        });
        console.log("Login response:", login);
        if (login.status === "failed")
            throw new Error("login failed: " + login.message);
        const user = login.user || login;

        // create room
        console.log('Creating room');
        const create = await sendRequest('createRoom', { roomname: 'test-room' });
        console.log('CreateRoom response:', create);
        if (create.status === 'failed') throw new Error('createRoom failed: ' + create.message);
        const roomId = (create.room && (create.room.id || create.room.code)) || create.id || create.code;
        if (!roomId) console.warn('No room identifier returned; skipping sendMessage/listMessages tests');

        // send a message (if we have an id)
        if (roomId) {
            console.log('Sending message to', roomId);
            const sent = await sendRequest("sendMessage", {
                conversationId: roomId,
                senderId: user.id,
                content: "hello from test",
            });
            console.log("sendMessage response:", sent);
            if (sent.status === "failed")
                throw new Error("sendMessage failed: " + sent.message);

            // list messages
            const listed = await sendRequest("listMessages", {
                conversationId: roomId,
                limit: 10,
            });
            console.log(
                "listMessages response:",
                Array.isArray(listed.messages)
                    ? `${listed.messages.length} messages`
                    : listed,
            );
            if (listed.status === "failed")
                throw new Error("listMessages failed: " + listed.message);
        }

        console.log("All sequence steps completed successfully");
        ws.close(1000, "test complete");
        process.exit(0);
    } catch (e) {
        console.error("Test sequence failed:", e && e.message ? e.message : e);
        ws.close();
        process.exit(4);
    }
});

ws.on("message", (data) => {
    try {
        const text = data.toString();
        let msg;
        try {
            msg = JSON.parse(text);
        } catch {
            msg = { raw: text };
        }
        // if message contains id and matches pending, resolve
        if (msg && msg.id && pending.has(msg.id)) {
            const p = pending.get(msg.id);
            clearTimeout(p.timer);
            pending.delete(msg.id);
            p.resolve(msg);
            return;
        }
        // otherwise log
        console.log("Server message (unsolicited):", msg);
    } catch (e) {
        console.error("Failed to handle incoming message:", e);
    }
});

ws.on("error", (err) => {
    console.error("WebSocket error:", err && err.message ? err.message : err);
    process.exit(3);
});

ws.on("close", (code, reason) => {
    console.log("Connection closed", code, reason && reason.toString());
});
