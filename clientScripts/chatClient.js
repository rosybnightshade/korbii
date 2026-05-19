// ChatClient - Frontend WebSocket handler for chat app
// Handles: user auth, room management, messaging, local state

class ChatClient {
    constructor(wsUrl = "ws://localhost:5500") {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.connected = false;

        // User & Room state
        this.userId = null;
        this.username = null;
        this.currentRoom = null;
        this.currentRoomId = null;

        // Message tracking
        this.messages = [];
        this.requestId = 0; // for tracking responses
        this.pendingRequests = new Map();

        // Callbacks
        this.onMessageReceived = null;
        this.onConnectionChange = null;
        this.onError = null;
        this.onListMessagesReceived = null;
    }

    addMessageToLocal(message) {
        if (!message || !message.id) return false;
        const exists = this.messages.some((m) => m && m.id === message.id);
        if (exists) return false;
        this.messages.push(message);
        return true;
    }

    // ==================== CONNECTION ====================

    connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.wsUrl);

                this.ws.onopen = () => {
                    this.connected = true;
                    console.log("WebSocket connected", {
                        url: this.wsUrl,
                        readyState: this.ws.readyState,
                    });
                    if (this.onConnectionChange) this.onConnectionChange(true);
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.ws.onerror = (error) => {
                    console.error("WebSocket error:", error);
                    if (this.onError) this.onError(error);
                    // Do not always reject here; only reject if connection hasn't opened yet
                    if (!this.connected) reject(error);
                };

                this.ws.onclose = (event) => {
                    this.connected = false;
                    console.log("WebSocket disconnected", {
                        code: event.code,
                        reason: event.reason,
                    });
                    if (this.onConnectionChange) this.onConnectionChange(false);

                    // Reject any pending requests so callers don't hang indefinitely
                    const err = new Error("WebSocket closed");
                    for (const [
                        key,
                        handler,
                    ] of this.pendingRequests.entries()) {
                        try {
                            handler.reject(err);
                        } catch (e) {
                            // ignore
                        }
                    }
                    this.pendingRequests.clear();
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }

    // ==================== USER AUTH ====================

    async registerUser(username, email, password, name = "") {
        const response = await this.sendRequest("register", {
            username,
            email,
            password,
            name: name || username,
        });

        // Check for success and user object
        if (response && response.status === "success" && response.user) {
            this.userId = response.user.id;
            this.username = response.user.username;
            this.saveUserToLocalStorage();
            return response.user;
        }

        return null;
    }

    async loginUser(identifier, password) {
        const response = await this.sendRequest("login", {
            identifier,
            password,
        });

        // Check for success and user object
        if (response && response.status === "success" && response.user) {
            this.userId = response.user.id;
            this.username = response.user.username;
            this.saveUserToLocalStorage();
            return response.user;
        }

        return null;
    }

    // Restore user from localStorage if they were previously logged in
    restoreUserFromLocalStorage() {
        const stored = localStorage.getItem("chatUser");
        if (stored) {
            const user = JSON.parse(stored);
            this.userId = user.id;
            this.username = user.username;
            return user;
        }
        return null;
    }

    saveUserToLocalStorage() {
        localStorage.setItem(
            "chatUser",
            JSON.stringify({
                id: this.userId,
                username: this.username,
            }),
        );
    }

    clearUserFromLocalStorage() {
        localStorage.removeItem("chatUser");
        this.userId = null;
        this.username = null;
    }

    // ==================== ROOM MANAGEMENT ====================

    async createRoom(roomname) {
        const requestId = this.generateRequestId();

        const payload = {
            command: "createRoom",
            id: requestId,
            body: {
                roomname,
            },
        };

        const response = await this.sendAndWaitForResponse(payload, requestId);

        if (response && response.status === "success" && response.room) {
            this.currentRoom = response.room;
            // prefer id, fallback to code (match CLI behavior)
            this.currentRoomId = response.room.id || response.room.code;
            this.messages = [];
            console.info(
                "createRoom assigned currentRoomId",
                this.currentRoomId,
                "room=",
                response.room,
            );
            return response.room;
        }

        return null;
    }

    async joinRoom(roomcode) {
        const requestId = this.generateRequestId();

        const payload = {
            command: "joinRoom",
            id: requestId,
            body: {
                roomcode: Number(roomcode),
            },
        };

        const response = await this.sendAndWaitForResponse(payload, requestId);

        if (response && response.status === "success" && response.room) {
            this.currentRoom = response.room;
            this.currentRoomId = response.room.id || response.room.code;
            this.messages = [];
            console.info(
                "joinRoom assigned currentRoomId",
                this.currentRoomId,
                "room=",
                response.room,
            );
            return response.room;
        }

        return null;
    }

    getCurrentRoom() {
        return this.currentRoom;
    }

    // ==================== INTERNAL HELPERS ====================

    generateRequestId() {
        // Match CLI style: string id with timestamp + random suffix
        return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    // New: consistent request sender (matches CLI): uses string id, checks readyState,
    // sets per-request timeout and stores resolvers in pendingRequests.
    async sendRequest(command, body = {}, timeout = 8000) {
        // ensure websocket open
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            // attempt to connect (will resolve when open) or fail
            try {
                await Promise.race([
                    this.connect(),
                    new Promise((_, rej) =>
                        setTimeout(
                            () => rej(new Error("WS connect timeout")),
                            timeout,
                        ),
                    ),
                ]);
            } catch (e) {
                throw new Error("WebSocket not open");
            }
        }

        return new Promise((resolve, reject) => {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const payload = { id, command, body };

            const timer = setTimeout(() => {
                if (this.pendingRequests.has(id))
                    this.pendingRequests.delete(id);
                reject(new Error("timeout"));
            }, timeout);

            // store handler that clears timer when invoked
            this.pendingRequests.set(id, {
                resolve: (data) => {
                    clearTimeout(timer);
                    resolve(data);
                },
                reject: (err) => {
                    clearTimeout(timer);
                    reject(err);
                },
            });

            // send payload; send() logs and returns false if not connected
            console.debug(
                "sendRequest sending payload:",
                payload,
                "readyState=",
                this.ws ? this.ws.readyState : "no-ws",
            );
            let ok = false;
            try {
                ok = this.send(payload);
            } catch (e) {
                ok = false;
            }

            if (!ok) {
                // attempt direct ws.send as a last-resort fallback
                try {
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        const json = JSON.stringify(payload);
                        console.warn(
                            "sendRequest fallback: using direct ws.send",
                            json,
                        );
                        this.ws.send(json);
                        ok = true;
                    }
                } catch (e) {
                    console.error("sendRequest direct ws.send failed:", e);
                    ok = false;
                }
            }

            if (!ok) {
                this.pendingRequests.delete(id);
                clearTimeout(timer);
                return reject(new Error("failed to send"));
            }
        });
    }

    send(data) {
        const ready = this.ws ? this.ws.readyState : "no-ws";
        console.debug(
            "WebSocket send attempt, readyState=",
            ready,
            "data=",
            data,
        );
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                const json = JSON.stringify(data);
                console.debug("WebSocket send (ready):", json);
                this.ws.send(json);
                return true;
            } catch (err) {
                console.error("Failed to send via WebSocket:", err);
                return false;
            }
        }

        console.error(
            "WebSocket not open for send (aborted). readyState=",
            this.ws ? this.ws.readyState : "no-ws",
            "data=",
            data,
        );
        return false;
    }

    sendAndWaitForResponse(payload, requestId, timeout = 5000) {
        return new Promise((resolve, reject) => {
            (async () => {
                // If not connected, attempt one reconnect before failing
                if (
                    !this.connected ||
                    !this.ws ||
                    this.ws.readyState !== WebSocket.OPEN
                ) {
                    console.warn(
                        "Socket not connected or not OPEN, attempting reconnect... readyState=",
                        this.ws ? this.ws.readyState : "no-ws",
                    );
                    try {
                        await Promise.race([
                            this.connect(),
                            new Promise((_, rej) =>
                                setTimeout(
                                    () => rej(new Error("WS connect timeout")),
                                    timeout,
                                ),
                            ),
                        ]);
                        console.info("Reconnected WebSocket");
                    } catch (e) {
                        console.error("Reconnect attempt failed:", e);
                        return reject(new Error("WebSocket not connected"));
                    }
                }

                const key = String(requestId);
                // Ensure payload.id is the same string id (some callers may pass numeric)
                payload.id = key;

                // Set up timeout
                const timeoutId = setTimeout(() => {
                    this.pendingRequests.delete(key);
                    reject(new Error(`Request ${requestId} timed out`));
                }, timeout);

                // Store resolver for this request
                this.pendingRequests.set(key, {
                    resolve: (data) => {
                        clearTimeout(timeoutId);
                        resolve(data);
                    },
                    reject: (error) => {
                        clearTimeout(timeoutId);
                        reject(error);
                    },
                });

                // Attempt to send; if send fails try one more reconnect/send before failing
                let sent = false;
                try {
                    sent = this.send(payload);
                } catch (e) {
                    sent = false;
                }

                if (!sent) {
                    console.warn(
                        "Initial send failed for payload, attempting reconnect+send...",
                    );
                    try {
                        await this.connect();
                    } catch (e) {
                        this.pendingRequests.delete(key);
                        clearTimeout(timeoutId);
                        return reject(
                            new Error("Failed to reconnect for send"),
                        );
                    }
                    // try sending again
                    try {
                        sent = this.send(payload);
                    } catch (e) {
                        sent = false;
                    }
                }

                if (!sent) {
                    this.pendingRequests.delete(key);
                    clearTimeout(timeoutId);
                    return reject(new Error("Failed to send payload"));
                }
            })();
        });
    }

    // ==================== MESSAGING ====================

    async sendMessage(text) {
        console.debug("sendMessage called", {
            text,
            connected: this.connected,
            userId: this.userId,
            currentRoomId: this.currentRoomId,
        });

        // Ensure socket is open before proceeding
        const okConn = await this.ensureConnected(5000);
        if (!okConn) {
            throw new Error("Unable to connect to chat server");
        }

        // Attempt to recover userId from localStorage if missing
        if (!this.userId) {
            const stored = this.restoreUserFromLocalStorage();
            if (stored) {
                console.info(
                    "Recovered user from localStorage",
                    stored.username,
                );
            }
        }

        // Attempt to recover currentRoomId from session storage if missing
        if (!this.currentRoomId) {
            try {
                const sess = JSON.parse(
                    localStorage.getItem("chatSession") || "null",
                );
                if (sess && sess.currentRoom) {
                    this.currentRoom = sess.currentRoom;
                    this.currentRoomId =
                        sess.currentRoom.id || sess.currentRoom.code;
                    console.info(
                        "Recovered current room from session",
                        this.currentRoom,
                    );
                }
            } catch (e) {
                // ignore
            }
        }

        if (!this.userId) {
            throw new Error("Not logged in");
        }

        if (!this.currentRoomId) {
            throw new Error("Not in a room");
        }

        const requestId = this.generateRequestId();

        const payload = {
            command: "sendMessage",
            id: requestId,
            body: {
                content: text,
                conversationId:
                    this.currentRoomId ||
                    (this.currentRoom &&
                        (this.currentRoom.id || this.currentRoom.code)),
                senderId: this.userId,
            },
        };

        console.debug("Prepared sendMessage payload:", payload);

        try {
            // Use sendRequest to send the command via the consistent request path
            const response = await this.sendRequest(
                "sendMessage",
                payload.body,
                5000,
            );
            console.debug("sendMessage response:", response);
            if (response && response.status === "success") {
                // Add immediately from ack for fast local feedback; push will be deduped.
                const msg = response.message || response.msg || null;
                const added = this.addMessageToLocal(msg);
                if (msg && added && this.onMessageReceived) {
                    try {
                        this.onMessageReceived(msg);
                    } catch (e) {
                        console.error("onMessageReceived handler threw:", e);
                    }
                }
                return response;
            }
            throw new Error(
                (response && response.message) || "sendMessage did not succeed",
            );
        } catch (err) {
            console.error("sendMessage error:", err);
            throw err;
        }
    }

    // ==================== MESSAGE LISTING ====================

    async listMessages(conversationId = null, limit = 50, offset = 0) {
        const requestId = this.generateRequestId();

        // ensure conversation id is available
        let conv =
            conversationId ||
            this.currentRoomId ||
            (this.currentRoom &&
                (this.currentRoom.id || this.currentRoom.code));
        if (!conv) {
            try {
                const sess = JSON.parse(
                    localStorage.getItem("chatSession") || "null",
                );
                if (sess && sess.currentRoom) {
                    conv = sess.currentRoom.id || sess.currentRoom.code;
                    // also set runtime state
                    this.currentRoom = sess.currentRoom;
                    this.currentRoomId = conv;
                    console.info(
                        "listMessages recovered conversationId from session",
                        conv,
                    );
                }
            } catch (e) {
                // ignore
            }
        }

        if (!conv) {
            console.error(
                "listMessages: no conversationId available, aborting request",
            );
            return [];
        }

        console.debug(
            "listMessages called, conversationId=",
            conv,
            "limit=",
            limit,
            "offset=",
            offset,
        );

        const payload = {
            command: "listMessages",
            id: requestId,
            body: {
                conversationId: conv,
                limit,
                offset,
            },
        };

        try {
            const response = await this.sendAndWaitForResponse(
                payload,
                requestId,
            );
            if (
                response &&
                response.status === "success" &&
                Array.isArray(response.messages)
            ) {
                // server returns newest-first; reverse to chronological order
                const messages = response.messages.slice().reverse();
                this.messages = messages;
                if (this.onListMessagesReceived) {
                    try {
                        this.onListMessagesReceived(messages);
                    } catch (e) {
                        console.error(
                            "onListMessagesReceived handler error:",
                            e,
                        );
                    }
                }
                return messages;
            }
        } catch (e) {
            console.error("listMessages error:", e);
        }

        return [];
    }

    // Ensure websocket connection is open (awaits connect if needed)
    async ensureConnected(timeout = 5000) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.connected)
            return true;
        try {
            await Promise.race([
                this.connect(),
                new Promise((_, rej) =>
                    setTimeout(
                        () => rej(new Error("WS connect timeout")),
                        timeout,
                    ),
                ),
            ]);
            return true;
        } catch (e) {
            console.error("ensureConnected failed:", e);
            return false;
        }
    }

    // Handle incoming websocket messages (pushes and responses)
    handleMessage(rawData) {
        try {
            const data = JSON.parse(rawData);

            // Handle incoming chat messages via push event
            if (data.event === "message") {
                console.debug("push message received:", data);
                const message = data.message;
                const msgConv =
                    message &&
                    (message.conversationId ||
                        message.conversation_id ||
                        message.conversation ||
                        null);
                const currConv =
                    this.currentRoomId ||
                    (this.currentRoom &&
                        (this.currentRoom.id || this.currentRoom.code));
                if (!currConv || String(msgConv) !== String(currConv)) {
                    return; // ignore messages for other conversations
                }
                const added = this.addMessageToLocal(message);
                if (added && this.onMessageReceived) {
                    try {
                        this.onMessageReceived(message);
                    } catch (e) {
                        console.error("onMessageReceived handler threw:", e);
                    }
                }
                return;
            }

            // Handle responses to our requests by ID
            const respId =
                data && (data.id || data.id === 0) ? String(data.id) : null;
            if (respId && this.pendingRequests.has(respId)) {
                const handler = this.pendingRequests.get(respId);
                this.pendingRequests.delete(respId);

                // Backend returns status: "failed" or "success"
                if (data.status === "failed" || data.error) {
                    handler.reject(
                        new Error(
                            data.message || data.error || "Request failed",
                        ),
                    );
                } else {
                    handler.resolve(data);
                }
                return;
            }

            // Handle listMessages response (might not have ID match)
            if (data.status === "success" && Array.isArray(data.messages)) {
                // server may return newest-first; normalize to chronological
                const messages = data.messages.slice().reverse();
                this.messages = messages;
                if (this.onListMessagesReceived) {
                    try {
                        this.onListMessagesReceived(messages);
                    } catch (e) {
                        console.error(
                            "onListMessagesReceived handler error:",
                            e,
                        );
                    }
                }
                return;
            }
        } catch (error) {
            console.error("Error handling message:", error);
            if (this.onError) this.onError(error);
        }
    }
}

// Export for use
if (typeof module !== "undefined" && module.exports) {
    module.exports = ChatClient;
}
