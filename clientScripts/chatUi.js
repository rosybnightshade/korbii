// ChatUI - Wire up ChatClient to your HTML chatbox

class ChatUI {
    constructor(chatClient) {
        this.chat = chatClient;

        // DOM elements - prefer elements inside the visible chat screen if present
        // Try to select scoped elements inside #chat-screen first
        const scoped = (sel) =>
            document.querySelector(`#chat-screen ${sel}`) ||
            document.getElementById(sel.replace(/^#/, ""));
        this.chatbox = scoped("#chatbox");
        this.chatboxDetails = scoped("#chatbox-details");
        this.chatboxRoomname = scoped("#chatbox-details-roomname");
        this.chatboxRoomcode = scoped("#chatbox-details-roomcode");
        this.chatboxChats = scoped("#chatbox-chats");
        this.chatboxInput = scoped("#chatbox-input-input");
        this.chatboxBtn = scoped("#chatbox-input-btn");

        // Bind events
        this.setupEventListeners();

        // Set up chat client callbacks
        this.setupChatCallbacks();
    }

    setupEventListeners() {
        // Safe guards: only bind if elements exist
        if (this.chatboxBtn) {
            // Send button click
            this.chatboxBtn.addEventListener("click", () => {
                this.handleSendMessage();
            });
        }

        if (this.chatboxInput) {
            // Send on Enter key
            this.chatboxInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });
        }
    }

    setupChatCallbacks() {
        // When a new message comes in from the server
        this.chat.onMessageReceived = (message) => {
            this.addMessageToUI(message);
        };

        // When message history is loaded
        this.chat.onListMessagesReceived = (messages) => {
            this.clearMessages();
            messages.forEach((msg) => this.addMessageToUI(msg));
        };

        // Connection status
        this.chat.onConnectionChange = (connected) => {
            console.log("Connection status:", connected);
            // Could add a visual indicator here
        };

        // Errors
        this.chat.onError = (error) => {
            console.error("Chat error:", error);
            this.showError(
                error && error.message ? error.message : String(error),
            );
        };
    }

    // ==================== MESSAGE RENDERING ====================

    addMessageToUI(message) {
        // If chat container isn't available, try to find a fallback
        if (!this.chatboxChats) {
            this.chatboxChats =
                document.querySelector("#chat-screen #chatbox-chats") ||
                document.getElementById("chatbox-chats");
        }
        if (!this.chatboxChats) {
            console.log(
                "Received message but chat container is missing:",
                message,
            );
            return;
        }

        const messageEl = document.createElement("div");

        // Determine if this is a message from the current user
        const isLocal =
            message.senderId === this.chat.userId ||
            (message.sender && message.sender.id === this.chat.userId);
        messageEl.className = isLocal
            ? "chatbox-chats-chat-local"
            : "chatbox-chats-chat-foreign";

        // Create username element
        const usernameEl = document.createElement("p");
        usernameEl.className = "chatbox-chats-username";
        // Try different field names the backend might use
        usernameEl.textContent =
            (message.sender && message.sender.username) ||
            message.senderName ||
            message.username ||
            "Unknown";

        // Create content element
        const contentEl = document.createElement("p");
        contentEl.className = "chatbox-chats-content";
        // Try different field names for message content
        contentEl.textContent = message.content || message.text || "";

        // Append to message container
        messageEl.appendChild(usernameEl);
        messageEl.appendChild(contentEl);

        // Add to chatbox and scroll to bottom
        this.chatboxChats.appendChild(messageEl);
        this.chatboxChats.scrollTop = this.chatboxChats.scrollHeight;
    }

    clearMessages() {
        if (this.chatboxChats) this.chatboxChats.innerHTML = "";
    }

    // ==================== ROOM INFO ====================

    updateRoomInfo(room) {
        if (!room) return;
        const name = room.name || room.roomname || "Unknown Room";
        const code = room.code || room.roomcode || "---";
        // Update any matching elements (both the main chatbox and the chat-screen copy)
        const elsName = document.querySelectorAll(
            "#chatbox-details-roomname, #chat-screen #chatbox-details-roomname",
        );
        const elsCode = document.querySelectorAll(
            "#chatbox-details-roomcode, #chat-screen #chatbox-details-roomcode",
        );
        elsName.forEach((el) => (el.textContent = name));
        elsCode.forEach((el) => (el.textContent = code));
    }

    // ==================== SEND MESSAGE ====================

    async handleSendMessage() {
        if (!this.chatboxInput) return;

        const text = this.chatboxInput.value.trim();

        if (!text) {
            return;
        }

        // Disable input while sending
        this.chatboxInput.disabled = true;
        if (this.chatboxBtn) this.chatboxBtn.disabled = true;

        try {
            await this.chat.sendMessage(text);
            // Clear input on success
            this.chatboxInput.value = "";
        } catch (error) {
            console.error("Failed to send message:", error);
            this.showError("Failed to send message");
        } finally {
            // Re-enable input
            this.chatboxInput.disabled = false;
            if (this.chatboxBtn) this.chatboxBtn.disabled = false;
            try {
                this.chatboxInput.focus();
            } catch (e) {}
        }
    }

    // ==================== UTILS ====================

    showError(message) {
        // Simple alert for now, could be a toast notification
        console.error(message);
        // alert(message);
    }

    clearInput() {
        if (this.chatboxInput) this.chatboxInput.value = "";
    }

    focusInput() {
        if (this.chatboxInput) this.chatboxInput.focus();
    }
}
