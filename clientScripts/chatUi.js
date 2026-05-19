// ChatUI - Wire up ChatClient to your HTML chatbox

class ChatUI {
    constructor(chatClient) {
        this.chat = chatClient;

        // DOM selection helper: when there are duplicate IDs select the visible one
        const findVisible = (sel) => {
            // if sel starts with #, use getElementById but handle duplicates by querySelectorAll
            try {
                const nodes = document.querySelectorAll(sel);
                for (const n of nodes) {
                    // visible if it has layout or is not hidden
                    if (n && n.getClientRects && n.getClientRects().length > 0) return n;
                    if (n && n.offsetParent !== null) return n;
                    // also accept if it's inside #chat-screen which may be the visible container
                }
            } catch (e) {}
            // fallback to single query
            return document.querySelector(sel);
        };

        this.chatbox = findVisible('#chatbox') || document.getElementById('chatbox');
        this.chatboxDetails = findVisible('#chatbox-details') || document.getElementById('chatbox-details');
        this.chatboxRoomname = findVisible('#chatbox-details-roomname') || document.getElementById('chatbox-details-roomname');
        this.chatboxRoomcode = findVisible('#chatbox-details-roomcode') || document.getElementById('chatbox-details-roomcode');
        this.chatboxChats = findVisible('#chatbox-chats') || document.getElementById('chatbox-chats');
        // Defer input/button creation to ensureVisibleInput (so we always create them inside visible chat-screen)
        this.chatboxInput = findVisible('#chatbox-input-input') || null;
        this.chatboxBtn = findVisible('#chatbox-input-btn') || null;

        // Set up chat client callbacks first
        this.setupChatCallbacks();

        // Bind events (delegated listeners) - direct input/button listeners will be bound inside ensureVisibleInput
        this.setupEventListeners();

        // Ensure visible input exists (creates input/button inside visible chat-screen if needed)
        try { this.ensureVisibleInput(); } catch (e) { /* ignore */ }
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

        // Delegated fallback: if elements are replaced later, catch clicks/keypress anywhere
        this._delegatedClick = (e) => {
            const btn =
                e.target.closest && e.target.closest("#chatbox-input-btn");
            if (btn) {
                e.preventDefault();
                this.handleSendMessage();
            }
        };
        document.addEventListener("click", this._delegatedClick);

        this._delegatedKey = (e) => {
            const target = e.target;
            if (!target) return;
            const isInput =
                target.id === "chatbox-input-input" ||
                (target.closest && !!target.closest("#chatbox-input"));
            if (!isInput) return;
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        };
        document.addEventListener("keydown", this._delegatedKey);
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

        // Ensure client's runtime room state is consistent
        try {
            this.chat.currentRoom = room;
            this.chat.currentRoomId = room.id || room.code;
        } catch (e) {
            // ignore
        }

        // Refresh reference to the visible messages container (handles duplicate IDs)
        try {
            this.chatboxChats =
                document.querySelector("#chat-screen #chatbox-chats") ||
                document.getElementById("chatbox-chats");
        } catch (e) {
            // ignore
        }

        // Ensure visible chat-screen has an input and button bound
        try {
            this.ensureVisibleInput();
        } catch (e) {
            console.warn("ensureVisibleInput failed:", e);
        }

        // Request message history for this room so the UI can render past messages.
        try {
            if (this.chat && typeof this.chat.listMessages === "function") {
                const roomId = room.id || room.code || undefined;
                const maybePromise = this.chat.listMessages(roomId);
                // If the client returns messages directly or a promise that resolves to messages, render them too
                if (maybePromise && typeof maybePromise.then === "function") {
                    maybePromise
                        .then((msgs) => {
                            if (Array.isArray(msgs)) {
                                this.clearMessages();
                                msgs.forEach((m) => this.addMessageToUI(m));
                            }
                        })
                        .catch((err) => console.warn("listMessages failed:", err));
                } else if (Array.isArray(maybePromise)) {
                    // synchronous return
                    this.clearMessages();
                    maybePromise.forEach((m) => this.addMessageToUI(m));
                }
            }
        } catch (e) {
            console.warn("Failed to request message history:", e);
        }
    }

    // Helper: reliably find the visible #chatbox element (handles duplicate IDs)
    getVisibleChatbox() {
        try {
            const nodes = document.querySelectorAll('#chatbox');
            for (const n of nodes) {
                if (!n) continue;
                try {
                    if (n.getClientRects && n.getClientRects().length > 0) return n;
                    if (n.offsetParent !== null) return n;
                } catch (e) {}
            }
        } catch (e) {}
        // fallbacks
        return document.querySelector('#chat-screen #chatbox') || document.querySelector('#chatbox');
    }

    // Ensure an input+button exist inside the visible #chat-screen #chatbox
    ensureVisibleInput() {
        // Prefer the chatbox inside the visible chat-screen
        const visibleBox = this.getVisibleChatbox();
         if (!visibleBox) return;

         let inputWrapper = visibleBox.querySelector("#chatbox-input");
         if (!inputWrapper) {
             inputWrapper = document.createElement("div");
             inputWrapper.id = "chatbox-input";
             inputWrapper.style.display = "flex";
             inputWrapper.style.gap = "8px";
             inputWrapper.style.marginTop = "8px";
             visibleBox.appendChild(inputWrapper);
         }

         // If elements already exist in visibleBox, use them
         let inp = inputWrapper.querySelector("#chatbox-input-input");
         let btn = inputWrapper.querySelector("#chatbox-input-btn");

         // If not, create fresh ones (do not reuse inputs from hidden boxes)
         if (!inp) {
             inp = document.createElement("input");
             inp.id = "chatbox-input-input";
             inp.type = "text";
             inp.placeholder = "Type your message here...";
             inp.style.flex = "1";
             inputWrapper.appendChild(inp);
         }
         if (!btn) {
             btn = document.createElement("button");
             btn.id = "chatbox-input-btn";
             btn.textContent = "send";
             inputWrapper.appendChild(btn);
         }

         // Replace references and bind direct listeners (avoid double-binding by removing any existing)
         this.chatboxInput = inp;
         this.chatboxBtn = btn;

         // Remove previous direct listeners by cloning node (cheap way)
         const newInp = this.chatboxInput.cloneNode(true);
         this.chatboxInput.parentNode.replaceChild(newInp, this.chatboxInput);
         this.chatboxInput = newInp;
         const newBtn = this.chatboxBtn.cloneNode(true);
         this.chatboxBtn.parentNode.replaceChild(newBtn, this.chatboxBtn);
         this.chatboxBtn = newBtn;

         // Bind direct handlers
         this.chatboxBtn.addEventListener("click", () => this.handleSendMessage());
         this.chatboxInput.addEventListener("keypress", (e) => {
             if (e.key === "Enter" && !e.shiftKey) {
                 e.preventDefault();
                 this.handleSendMessage();
             }
         });
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

    // Clean up delegated listeners if needed (optional helper)
    destroy() {
        try {
            if (this._delegatedClick)
                document.removeEventListener("click", this._delegatedClick);
            if (this._delegatedKey)
                document.removeEventListener("keydown", this._delegatedKey);
        } catch (e) {}
    }
}
