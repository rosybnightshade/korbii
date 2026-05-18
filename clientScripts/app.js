const chat = new ChatClient("ws://localhost:5500");
let ui = null;

// INITIALIZATION

async function initApp() {
    try {
        await chat.connect();
        console.log("Connected to chat server");

        const restoredUser = chat.restoreUserFromLocalStorage();
        if (restoredUser) {
            console.log("Restored user:", restoredUser.username);
            showChatUI();
        } else {
            showAuthUI();
        }
    } catch (error) {
        console.error("Failed to initialize:", error);
        alert("Failed to connect to chat server");
    }
}

// SCREEN MANAGEMENT

function showAuthUI() {
    document.getElementById("auth-screen")?.classList.remove("hidden");
    document.getElementById("room-screen")?.classList.add("hidden");
    document.getElementById("chat-screen")?.classList.add("hidden");
}

function showRoomUI() {
    document.getElementById("auth-screen")?.classList.add("hidden");
    document.getElementById("room-screen")?.classList.remove("hidden");
    document.getElementById("chat-screen")?.classList.add("hidden");
}

function showChatUI() {
    document.getElementById("auth-screen")?.classList.add("hidden");
    document.getElementById("room-screen")?.classList.add("hidden");
    document.getElementById("chat-screen")?.classList.remove("hidden");

    if (!ui) {
        ui = new ChatUI(chat);
        if (chat.currentRoom) {
            ui.updateRoomInfo(chat.currentRoom);
        }
    }
}

// AUTH HANDLERS

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
        const user = await chat.registerUser(username, email, password);
        console.log("Registered:", user);
        alert("Registration successful! You can now log in.");

        document.getElementById("register-form").classList.add("hidden");
        document.getElementById("login-form").classList.remove("hidden");
    } catch (error) {
        alert("Registration failed: " + error.message);
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    if (!email || !password) {
        alert("Please fill in all fields");
        return;
    }

    try {
        const user = await chat.loginUser(email, password);
        console.log("Logged in as:", user.username);
        showRoomUI();
    } catch (error) {
        alert("Login failed: " + error.message);
    }
}

async function handleLogout() {
    if (confirm("Are you sure you want to log out?")) {
        chat.clearUserFromLocalStorage();
        chat.disconnect();
        await chat.connect();
        showAuthUI();
    }
}

// ROOM HANDLERS

async function handleCreateRoom(event) {
    event.preventDefault();

    const roomname = document.getElementById("create-roomname").value.trim();

    if (!roomname) {
        alert("Please enter a room name");
        return;
    }

    try {
        const room = await chat.createRoom(roomname);
        console.log("Room created:", room);

        ui = new ChatUI(chat);
        ui.updateRoomInfo(room);

        await chat.listMessages();

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
        console.log("Joined room:", room);

        ui = new ChatUI(chat);
        ui.updateRoomInfo(room);

        await chat.listMessages();

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
        showRoomUI();
    }
}

// DOM SETUP

document.addEventListener("DOMContentLoaded", async () => {
    document
        .getElementById("register-form")
        ?.addEventListener("submit", handleRegister);
    document
        .getElementById("login-form")
        ?.addEventListener("submit", handleLogin);

    document
        .getElementById("create-room-form")
        ?.addEventListener("submit", handleCreateRoom);
    document
        .getElementById("join-room-form")
        ?.addEventListener("submit", handleJoinRoom);

    document
        .getElementById("logout-btn")
        ?.addEventListener("click", handleLogout);
    document
        .getElementById("leave-room-btn")
        ?.addEventListener("click", handleLeaveRoom);

    await initApp();
});
