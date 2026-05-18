// Auth Screens JS - Just handles UI toggling for auth forms and room tabs

function toggleAuthForms(event) {
    event.preventDefault();

    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");

    loginForm.classList.toggle("hidden");
    registerForm.classList.toggle("hidden");
}

function switchRoomTab(event, tab) {
    event.preventDefault();

    // Update active tab button
    document.querySelectorAll(".room-tab").forEach((t) => {
        t.classList.remove("active");
    });
    event.target.classList.add("active");

    // Update active form
    document.querySelectorAll(".room-form").forEach((f) => {
        f.classList.remove("active-tab");
    });

    if (tab === "create") {
        document.getElementById("create-room-form").classList.add("active-tab");
    } else if (tab === "join") {
        document.getElementById("join-room-form").classList.add("active-tab");
    }
}
