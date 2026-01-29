const messagesContainer = document.getElementById("messages-container");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const newChatBtn = document.getElementById("new-chat-btn");

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

const sendMessage = async (msg) => {
  addMessage(msg, "user", "../static/user.jpeg");
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
      addMessage(reply || "Server error", "error", "../static/Error.png");
      return;
    }

    addMessage(reply, "aibot", "../static/Bot_logo.png");
  } catch (e) {
    loading.remove();
    addMessage("Network/server error", "error", "../static/Error.png");
  }
};

messageForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = messageInput.value.trim();
  if (!msg) return;
  messageInput.value = "";
  sendMessage(msg);
});

// Enter to send, Shift+Enter for newline
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    messageForm.requestSubmit();
  }
});

// New chat = reset backend + clear UI
newChatBtn.addEventListener("click", async () => {
  try {
    await fetch("/reset", { method: "POST" });
  } catch (e) {
    // Even if reset fails, still clear the UI
  }
  messagesContainer.innerHTML = "";
  messageInput.value = "";
  messageInput.focus();
});
