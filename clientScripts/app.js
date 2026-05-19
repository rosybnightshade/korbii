// Main app initialization
// Wire up ChatClient + ChatUI + Auth flows

const chat = new ChatClient("ws://localhost:5500");
let ui = null;

// ==================== SESSION STORAGE ====================

async function getSession() {
    const stored = localStorage.getItem("chatSession");
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            return null;
        }
    }
    return null;
}

async function setSession(obj) {
    localStorage.setItem("chatSession", JSON.stringify(obj));
}

async function clearSession() {
    localStorage.removeItem("chatSession");
}

// ==================== INITIALIZATION ====================

async function initApp() {
    try {
        // Connect to WebSocket
        await chat.connect();
        console.log("Connected to chat server");

        // Check if user is logged in
        const restoredUser = chat.restoreUserFromLocalStorage();
        if (restoredUser) {
            console.log("Restored user:", restoredUser.username);

            // Check if there's a current room saved
            const session = await getSession();
            if (session && session.currentRoom) {
                console.log("Restored room:", session.currentRoom.name);
                chat.currentRoom = session.currentRoom;
                chat.currentRoomId = Number(session.currentRoom.id);

                // Load message history and show chat
                try {
                    ui = new ChatUI(chat);
                    ui.updateRoomInfo(session.currentRoom);
                    await chat.listMessages();
                } catch (e) {
                    console.log("Failed to load room:", e.message);
                    showRoomUI();
                    return;
                }

                showChatUI();
            } else {
                // User logged in but no room, show room selection
                showRoomUI();
            }
        } else {
            // Show login/register UI
            showAuthUI();
        }
    } catch (error) {
        console.error("Failed to initialize:", error);
        alert("Failed to connect to chat server");
    }
}

// ==================== SCREEN MANAGEMENT ====================

function showAuthUI() {
    // Hide chat screens, show auth
    document.getElementById("auth-screen")?.classList.remove("hidden");
    document.getElementById("room-screen")?.classList.add("hidden");
    document.getElementById("chat-screen")?.classList.add("hidden");
}

function showRoomUI() {
    // Hide auth and chat, show room selection
    document.getElementById("auth-screen")?.classList.add("hidden");
    document.getElementById("room-screen")?.classList.remove("hidden");
    document.getElementById("chat-screen")?.classList.add("hidden");
}

function showChatUI() {
    // Hide auth and room, show chat
    document.getElementById("auth-screen")?.classList.add("hidden");
    document.getElementById("room-screen")?.classList.add("hidden");
    document.getElementById("chat-screen")?.classList.remove("hidden");

    // Initialize ChatUI if not already done
    if (!ui) {
        ui = new ChatUI(chat);
        if (chat.currentRoom) {
            ui.updateRoomInfo(chat.currentRoom);
        }
    }
}

// ==================== AUTH HANDLERS ====================

async function handleRegister(event) {
    event.preventDefault();

    const username = document.getElementById("register-username").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;

    if (!username || !email || !password) {
        alert("Please fill in all fields");
        return;
    }

    try {
        const user = await chat.registerUser(
            username,
            email,
            password,
            username,
        );
        if (!user) {
            alert("Registration failed");
            return;
        }
        console.log("Registered:", user.username);
        alert("Registration successful! You are now logged in.");
        showRoomUI();
    } catch (error) {
        alert("Registration failed: " + error.message);
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const identifier = document.getElementById("login-identifier").value.trim();
    const password = document.getElementById("login-password").value;

    if (!identifier || !password) {
        alert("Please fill in all fields");
        return;
    }

    try {
        const user = await chat.loginUser(identifier, password);
        if (!user) {
            alert("Login failed");
            return;
        }
        console.log("Logged in as:", user.username);
        // Persist saved user is already handled in loginUser; now ensure UI initialized
        ui = new ChatUI(chat);
        showRoomUI();
    } catch (error) {
        alert("Login failed: " + error.message);
    }
}

async function handleLogout() {
    if (!confirm("Are you sure you want to log out?")) return;

    try {
        chat.clearUserFromLocalStorage();
    } catch (e) {
        console.warn("Failed to clear user from localStorage:", e);
    }

    try {
        await clearSession();
    } catch (e) {
        console.warn("Failed to clear session:", e);
    }

    // Tear down UI state
    try {
        chat.disconnect();
    } catch (e) {
        console.warn("Error disconnecting:", e);
    }

    if (ui && typeof ui.destroy === "function") ui.destroy();
    ui = null;
    showAuthUI();
}

async function handleCreateRoom(event) {
    event.preventDefault();

    const roomname = document.getElementById("create-roomname").value.trim();

    if (!roomname) {
        alert("Please enter a room name");
        return;
    }

    try {
        const room = await chat.createRoom(roomname);
        if (!room) {
            alert("Failed to create room");
            return;
        }
        console.log("Room created:", room);

        // Initialize UI and load messages
        if (!ui) ui = new ChatUI(chat);
        ui.updateRoomInfo(room);

        try {
            await chat.listMessages();
        } catch (e) {
            console.log("No message history yet");
        }

        // Persist session current room
        try {
            await setSession({ currentRoom: room });
        } catch (e) {
            console.warn("Failed to persist session:", e);
        }

        showChatUI();
    } catch (error) {
        alert("Failed to create room: " + error.message);
    }
}

async function handleJoinRoom(event) {
    event.preventDefault();

    const roomcode = document.getElementById("join-roomcode").value.trim();

    if (!roomcode) {
        alert("Please enter a room code");
        return;
    }

    try {
        const room = await chat.joinRoom(roomcode);
        if (!room) {
            alert("Failed to join room");
            return;
        }
        console.log("Joined room:", room);

        // Initialize UI and load messages
        if (!ui) ui = new ChatUI(chat);
        ui.updateRoomInfo(room);

        try {
            await chat.listMessages();
        } catch (e) {
            console.log("No message history yet");
        }

        // Persist session current room
        try {
            await setSession({ currentRoom: room });
        } catch (e) {
            console.warn("Failed to persist session:", e);
        }

        showChatUI();
    } catch (error) {
        alert("Failed to join room: " + error.message);
    }
}

async function handleLeaveRoom() {
    if (confirm("Are you sure you want to leave this room?")) {
        chat.currentRoom = null;
        chat.currentRoomId = null;
        chat.messages = [];

        // Clear form inputs for next room
        const createInput = document.getElementById("create-roomname");
        const joinInput = document.getElementById("join-roomcode");
        if (createInput) createInput.value = "";
        if (joinInput) joinInput.value = "";

        // Clear saved session
        try {
            await clearSession();
        } catch (e) {
            console.warn("Failed to clear session:", e);
        }

        showRoomUI();
    }
}

// ==================== DOM SETUP ====================

document.addEventListener("DOMContentLoaded", async () => {
    // Wire up auth forms
    document
        .getElementById("register-form")
        ?.addEventListener("submit", handleRegister);
    document
        .getElementById("login-form")
        ?.addEventListener("submit", handleLogin);

    // Wire up room forms
    document
        .getElementById("create-room-form")
        ?.addEventListener("submit", handleCreateRoom);
    document
        .getElementById("join-room-form")
        ?.addEventListener("submit", handleJoinRoom);

    // Wire up buttons
    document
        .getElementById("logout-btn")
        ?.addEventListener("click", handleLogout);
    document
        .getElementById("leave-room-btn")
        ?.addEventListener("click", handleLeaveRoom);

    // Initialize app
    await initApp();
});
