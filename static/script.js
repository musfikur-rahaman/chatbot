const messagesContainer = document.getElementById("messages-container");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const newChatBtn = document.getElementById("new-chat-btn");

// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

// Avatars (place these files in /static)
const USER_AVATAR = "../static/user.jpeg";
const BOT_AVATAR = "../static/Bot_logo.png";
const ERROR_AVATAR = "../static/Error.png";

/* =========================
   MOBILE KEYBOARD FIX
   ========================= */
const setAppHeight = () => {
  document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
};
window.addEventListener("resize", setAppHeight);
setAppHeight();

/* =========================
   THEME TOGGLE (dark/light)
   ========================= */
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const themeText = document.getElementById("theme-text");

const applyTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);

  const isLight = theme === "light";
  themeIcon.textContent = isLight ? "☀️" : "🌙";
  themeText.textContent = isLight ? "Light" : "Dark";
};

// initial theme
const savedTheme = localStorage.getItem("theme");
if (savedTheme) {
  applyTheme(savedTheme);
} else {
  const prefersLight = window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches;
  applyTheme(prefersLight ? "light" : "dark");
}

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
});

/* =========================
   CHAT HELPERS
   ========================= */
const scrollBottom = () => {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

const addMessage = (text, role, img) => {
  const wrap = document.createElement("div");
  wrap.className = `message ${role}`;

  const avatar = document.createElement("img");
  avatar.src = img;

  const bubble = document.createElement("p");
  bubble.innerText = text;

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  messagesContainer.appendChild(wrap);
  scrollBottom();
};

const showLoading = () => {
  const wrap = document.createElement("div");
  wrap.className = "loading";

  const spinner = document.createElement("div");
  spinner.className = "spinner";

  const text = document.createElement("span");
  text.innerText = "Thinking…";

  wrap.appendChild(spinner);
  wrap.appendChild(text);
  messagesContainer.appendChild(wrap);
  scrollBottom();
  return wrap;
};

// Auto-grow textarea
const autoGrow = () => {
  messageInput.style.height = "auto";
  const h = Math.min(messageInput.scrollHeight, 160);
  messageInput.style.height = `${h}px`;
};
messageInput.addEventListener("input", autoGrow);

// iOS/Android: ensure composer stays visible when focusing input
messageInput.addEventListener("focus", () => {
  setTimeout(() => {
    messageInput.scrollIntoView({ block: "end", behavior: "smooth" });
  }, 150);
});

const sendMessage = async (msg) => {
  addMessage(msg, "user", USER_AVATAR);
  const loading = showLoading();

  try {
    const res = await fetch("/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: msg }),
    });

    const reply = await res.text();
    loading.remove();

    if (!res.ok) {
      addMessage(reply || "Server error", "error", ERROR_AVATAR);
      return;
    }

    addMessage(reply, "aibot", BOT_AVATAR);
  } catch (e) {
    loading.remove();
    addMessage("Network/server error", "error", ERROR_AVATAR);
  }
};

const resetChat = async () => {
  try {
    await fetch("/reset", { method: "POST" });
  } catch (e) {}
  messagesContainer.innerHTML = "";
  messageInput.value = "";
  autoGrow();
  messageInput.focus();
};

messageForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = messageInput.value.trim();
  if (!msg) return;
  messageInput.value = "";
  autoGrow();
  sendMessage(msg);
});

// Enter to send, Shift+Enter for newline
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    messageForm.requestSubmit();
  }
});

newChatBtn.addEventListener("click", resetChat);
