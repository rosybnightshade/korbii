import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

import { WebSocketServer } from "ws";

import {
    createChatServer,
    joinChatServer,
    registerUser,
    loginUser,
} from "./routes/socket.js";
import { sendMessage, listMessages } from "./routes/messages.js";

const WS_PORT = 8800;
const EX_PORT = 5500;

const app = express();

app.get("/", async (req, res) => {
    return res.send(JSON.stringify(await createChatServer()) + "hi");
});

const server = app.listen(EX_PORT, () => {
    console.log(`Webserver is now listening on http://localhost:${EX_PORT}`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", async (ws) => {
    console.log("Connection Established...");
    ws.userId = null;
    ws.currentRoom = null;

    ws.on("message", async (unprocessedData) => {
        try {
            const stringData = Buffer.isBuffer(unprocessedData)
                ? unprocessedData.toString("utf8")
                : unprocessedData;
            const data = JSON.parse(stringData);

            if (data.command == "createRoom") {
                if (!data.body.roomname) {
                    ws.send(
                        JSON.stringify({
                            id: data.id,
                            status: "failed",
                            message: "Roomname required.",
                        }),
                    );
                    console.log(
                        "Rejected room creation: \n" + JSON.stringify(data),
                    );
                    return;
                }
                const room = await createChatServer(ws, {
                    id: data.id,
                    roomname: data.body.roomname,
                });
                if (room)
                    ws.currentRoom = {
                        id: room.id,
                        code: room.code,
                        name: room.name,
                    };
            }

            if (data.command == "joinRoom") {
                if (!data.body.roomcode) {
                    ws.send(
                        JSON.stringify({
                            id: data.id,
                            status: "failed",
                            message: "Room code required",
                        }),
                    );
                    return;
                }

                const room = await joinChatServer(ws, {
                    id: data.id,
                    roomcode: data.body.roomcode,
                });
                if (room)
                    ws.currentRoom = {
                        id: room.id,
                        code: room.code,
                        name: room.name,
                    };
            }

            if (data.command == "register") {
                const user = await registerUser(ws, {
                    id: data.id,
                    ...(data.body || {}),
                });
                if (user && user.id) ws.userId = user.id;
            }

            if (data.command == "login") {
                const user = await loginUser(ws, {
                    id: data.id,
                    ...(data.body || {}),
                });
                if (user && user.id) ws.userId = user.id;
            }

            if (data.command == "sendMessage") {
                const msg = await sendMessage(ws, {
                    id: data.id,
                    ...(data.body || {}),
                });
                if (msg && msg.conversationId) {
                    const push = { event: "message", message: msg };
                    wss.clients.forEach((client) => {
                        if (client && client.readyState === 1) {
                            const clientRoom =
                                client.currentRoom &&
                                (client.currentRoom.id ||
                                    client.currentRoom.code);
                            if (
                                clientRoom &&
                                String(clientRoom) ===
                                    String(msg.conversationId)
                            ) {
                                try {
                                    client.send(JSON.stringify(push));
                                } catch (e) {}
                            }
                        }
                    });
                }
            }

            if (data.command == "listMessages") {
                await listMessages(ws, { id: data.id, ...(data.body || {}) });
            }
        } catch (error) {
            console.error("Message parsing error:", error.message);
            console.error("Failed data:", unprocessedData.toString("utf8"));
            ws.send(JSON.stringify({ error: "Invalid message format" }));
        }
    });

    ws.on("close", () => {
        console.log("Connection Terminated.");
    });
});
