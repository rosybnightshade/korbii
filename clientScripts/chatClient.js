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

    // ==================== CONNECTION ====================

    connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.wsUrl);

                this.ws.onopen = () => {
                    this.connected = true;
                    console.log("WebSocket connected");
                    if (this.onConnectionChange) this.onConnectionChange(true);
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.ws.onerror = (error) => {
                    console.error("WebSocket error:", error);
                    if (this.onError) this.onError(error);
                    reject(error);
                };

                this.ws.onclose = () => {
                    this.connected = false;
                    console.log("WebSocket disconnected");
                    if (this.onConnectionChange) this.onConnectionChange(false);
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

    async registerUser(username, email, password) {
        const requestId = this.generateRequestId();

        const payload = {
            command: "register",
            id: requestId,
            body: {
                username,
                email,
                password,
            },
        };

        return this.sendAndWaitForResponse(payload, requestId);
    }

    async loginUser(email, password) {
        const requestId = this.generateRequestId();

        const payload = {
            command: "login",
            id: requestId,
            body: {
                email,
                password,
            },
        };

        const response = await this.sendAndWaitForResponse(payload, requestId);

        // Store user data locally if successful
        if (response && response.id) {
            this.userId = response.id;
            this.username = response.username;
            this.saveUserToLocalStorage();
        }

        return response;
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

        if (response && response.id) {
            this.currentRoom = response;
            this.currentRoomId = response.id;
            this.messages = []; // Clear messages when switching rooms
            return response;
        }

        return null;
    }

    async joinRoom(roomcode) {
        const requestId = this.generateRequestId();

        const payload = {
            command: "joinRoom",
            id: requestId,
            body: {
                roomcode,
            },
        };

        const response = await this.sendAndWaitForResponse(payload, requestId);

        if (response && response.id) {
            this.currentRoom = response;
            this.currentRoomId = response.id;
            this.messages = []; // Clear messages when switching rooms
            return response;
        }

        return null;
    }

    getCurrentRoom() {
        return this.currentRoom;
    }

    // ==================== MESSAGING ====================

    async sendMessage(text) {
        if (!this.userId) {
            console.error("Not logged in");
            return null;
        }

        if (!this.currentRoomId) {
            console.error("Not in a room");
            return null;
        }

        const requestId = this.generateRequestId();

        const payload = {
            command: "sendMessage",
            id: requestId,
            body: {
                text,
                conversationId: this.currentRoomId,
                senderId: this.userId,
            },
        };

        return this.sendAndWaitForResponse(payload, requestId);
    }

    async listMessages(limit = 50, offset = 0) {
        const requestId = this.generateRequestId();

        const payload = {
            command: "listMessages",
            id: requestId,
            body: {
                conversationId: this.currentRoomId,
                limit,
                offset,
            },
        };

        return this.sendAndWaitForResponse(payload, requestId);
    }

    addMessageToLocal(message) {
        this.messages.push(message);
    }

    getMessages() {
        return this.messages;
    }

    // ==================== INTERNAL HELPERS ====================

    generateRequestId() {
        return ++this.requestId;
    }

    send(data) {
        if (this.connected && this.ws) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.error("WebSocket not connected");
        }
    }

    sendAndWaitForResponse(payload, requestId, timeout = 5000) {
        return new Promise((resolve, reject) => {
            // Set up timeout
            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request ${requestId} timed out`));
            }, timeout);

            // Store resolver for this request
            this.pendingRequests.set(requestId, {
                resolve: (data) => {
                    clearTimeout(timeoutId);
                    resolve(data);
                },
                reject: (error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                },
            });

            this.send(payload);
        });
    }

    handleMessage(rawData) {
        try {
            const data = JSON.parse(rawData);

            // Handle incoming chat messages
            if (data.event === "message") {
                this.addMessageToLocal(data.message);
                if (this.onMessageReceived) {
                    this.onMessageReceived(data.message);
                }
                return;
            }

            // Handle list messages response
            if (data.command === "listMessages" && data.messages) {
                this.messages = data.messages;
                if (this.onListMessagesReceived) {
                    this.onListMessagesReceived(data.messages);
                }
                return;
            }

            // Handle responses to our requests
            if (data.id && this.pendingRequests.has(data.id)) {
                const handler = this.pendingRequests.get(data.id);
                this.pendingRequests.delete(data.id);

                if (data.status === "failed" || data.error) {
                    handler.reject(new Error(data.message || data.error));
                } else {
                    handler.resolve(data);
                }
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
