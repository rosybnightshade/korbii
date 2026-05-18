class ChatUI {
    constructor(chatClient) {
        this.chat = chatClient;

        this.chatbox = document.getElementById("chatbox");
        this.chatboxDetails = document.getElementById("chatbox-details");
        this.chatboxRoomname = document.getElementById(
            "chatbox-details-roomname",
        );
        this.chatboxRoomcode = document.getElementById(
            "chatbox-details-roomcode",
        );
        this.chatboxChats = document.getElementById("chatbox-chats");
        this.chatboxInput = document.getElementById("chatbox-input-input");
        this.chatboxBtn = document.getElementById("chatbox-input-btn");

        this.setupEventListeners();
        this.setupChatCallbacks();
    }

    setupEventListeners() {
        this.chatboxBtn.addEventListener("click", () => {
            this.handleSendMessage();
        });

        this.chatboxInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });
    }

    setupChatCallbacks() {
        this.chat.onMessageReceived = (message) => {
            this.addMessageToUI(message);
        };

        this.chat.onListMessagesReceived = (messages) => {
            this.clearMessages();
            messages.forEach((msg) => this.addMessageToUI(msg));
        };

        this.chat.onConnectionChange = (connected) => {
            console.log("Connection status:", connected);
        };

        this.chat.onError = (error) => {
            console.error("Chat error:", error);
            this.showError(error.message);
        };
    }

    // MESSAGE RENDERING

    addMessageToUI(message) {
        const messageEl = document.createElement("div");

        const isLocal = message.senderId === this.chat.userId;
        messageEl.className = isLocal
            ? "chatbox-chats-chat-local"
            : "chatbox-chats-chat-foreign";

        const usernameEl = document.createElement("p");
        usernameEl.className = "chatbox-chats-username";
        usernameEl.textContent =
            message.senderName || message.username || "Unknown";

        const contentEl = document.createElement("p");
        contentEl.className = "chatbox-chats-content";
        contentEl.textContent = message.text || message.content || "";

        messageEl.appendChild(usernameEl);
        messageEl.appendChild(contentEl);

        this.chatboxChats.appendChild(messageEl);
        this.chatboxChats.scrollTop = this.chatboxChats.scrollHeight;
    }

    clearMessages() {
        this.chatboxChats.innerHTML = "";
    }

    // ROOM INFO

    updateRoomInfo(room) {
        this.chatboxRoomname.textContent =
            room.name || room.roomname || "Unknown Room";
        this.chatboxRoomcode.textContent = room.code || room.roomcode || "---";
    }

    // SEND MESSAGE

    async handleSendMessage() {
        const text = this.chatboxInput.value.trim();

        if (!text) {
            return;
        }

        this.chatboxInput.disabled = true;
        this.chatboxBtn.disabled = true;

        try {
            await this.chat.sendMessage(text);
            this.chatboxInput.value = "";
        } catch (error) {
            console.error("Failed to send message:", error);
            this.showError("Failed to send message");
        } finally {
            this.chatboxInput.disabled = false;
            this.chatboxBtn.disabled = false;
            this.chatboxInput.focus();
        }
    }

    showError(message) {
        console.error(message);
    }

    clearInput() {
        this.chatboxInput.value = "";
    }

    focusInput() {
        this.chatboxInput.focus();
    }
}
