document.addEventListener("DOMContentLoaded", () => {
  console.log("script.js loaded ✅");

  // =========================
  // DOM
  // =========================
  const messagesContainer = document.getElementById("messages-container");
  const messageForm = document.getElementById("message-form");
  const messageInput = document.getElementById("message-input");
  const sendBtn = document.querySelector(".send-btn");
  const newChatBtn = document.getElementById("new-chat-btn");

  const modeSelect = document.getElementById("mode-select");
  const pdfInput = document.getElementById("pdf-input");
  const uploadBtn = document.getElementById("upload-btn");
  const summarizeBtn = document.getElementById("summarize-btn");
  const pdfStatus = document.getElementById("pdf-status");

  const loginOpen = document.getElementById("login-open");
  const signupOpen = document.getElementById("signup-open");
  const logoutBtn = document.getElementById("logout-btn");
  const userPill = document.getElementById("user-pill");

  const authModal = document.getElementById("auth-modal");
  const authTitle = document.getElementById("auth-title");
  const authForm = document.getElementById("auth-form");
  const authEmail = document.getElementById("auth-email");
  const authPassword = document.getElementById("auth-password");
  const authCancel = document.getElementById("auth-cancel");
  const authError = document.getElementById("auth-error");

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // =========================
  // Required globals
  // =========================
  if (!window.supabase) console.error("❌ Supabase JS not loaded (CDN failed).");
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY. Open site from Flask, not file://");
  }
  console.log("Supabase URL:", window.SUPABASE_URL);
  console.log("Anon key present:", !!window.SUPABASE_ANON_KEY);

  // ✅ Explicit auth persistence + stable storageKey
  const sbClient = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "sb-session",
      },
    }
  );

  // =========================
  // State
  // =========================
  const USER_AVATAR = "/static/user.jpeg";
  const BOT_AVATAR = "/static/Bot_logo.png";
  const ERROR_AVATAR = "/static/Error.png";

  let pdfIndexed = false;
  let authMode = "login";
  let conversationId = localStorage.getItem("conversation_id") || "";

  let showedLoginHint = false;
  let showedWelcome = false;

  let authChangeHandling = false;

  // =========================
  // Mobile viewport helper
  // =========================
  const setAppHeight = () => {
    document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
  };
  window.addEventListener("resize", setAppHeight);
  setAppHeight();

  // =========================
  // Theme toggle
  // =========================
  const themeToggle = document.getElementById("theme-toggle");
  const themeIcon = document.getElementById("theme-icon");
  const themeText = document.getElementById("theme-text");

  const applyTheme = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    const isLight = theme === "light";
    if (themeIcon) themeIcon.textContent = isLight ? "☀️" : "🌙";
    if (themeText) themeText.textContent = isLight ? "Light" : "Dark";
  };

  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) applyTheme(savedTheme);
  else {
    const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    applyTheme(prefersLight ? "light" : "dark");
  }

  themeToggle?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
  });

  // =========================
  // UI helpers
  // =========================
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

  const autoGrow = () => {
    messageInput.style.height = "auto";
    const h = Math.min(messageInput.scrollHeight, 160);
    messageInput.style.height = `${h}px`;
  };
  messageInput?.addEventListener("input", autoGrow);

  messageInput?.addEventListener("focus", () => {
    setTimeout(() => messageInput.scrollIntoView({ block: "end", behavior: "smooth" }), 150);
  });

  function setPdfStatus(indexed, details = "") {
    pdfIndexed = !!indexed;
    if (pdfStatus) pdfStatus.textContent = indexed ? `PDFs: indexed ${details}` : "PDFs: not indexed";
    if (summarizeBtn) summarizeBtn.disabled = !indexed;
  }

  function setEnabled(enabled) {
    if (messageInput) messageInput.disabled = !enabled;
    if (sendBtn) sendBtn.disabled = !enabled;
    if (newChatBtn) newChatBtn.disabled = !enabled;
    if (modeSelect) modeSelect.disabled = !enabled;

    if (messageInput) messageInput.placeholder = enabled ? "Type a message…" : "Login to start…";
  }

  async function readTextOrJson(res) {
    const raw = await res.text();
    try { return JSON.parse(raw); } catch { return raw; }
  }

  // =========================
  // Auth modal (FIXED focus + inert)
  // =========================
  function openAuthModal(mode) {
    authMode = mode;

    if (authTitle) authTitle.textContent = mode === "signup" ? "Sign up" : "Login";
    if (authError) authError.textContent = "";
    if (authEmail) authEmail.value = "";
    if (authPassword) authPassword.value = "";

    if (authModal) {
      authModal.style.display = "flex";
      authModal.setAttribute("aria-hidden", "false");
      authModal.inert = false;
    }

    setTimeout(() => authEmail?.focus(), 0);
  }

  function closeAuthModal() {
    // ✅ remove focus from inside modal before hiding
    if (document.activeElement && authModal?.contains(document.activeElement)) {
      document.activeElement.blur();
    }

    if (authModal) {
      authModal.setAttribute("aria-hidden", "true");
      authModal.inert = true;
      authModal.style.display = "none";
    }

    setTimeout(() => loginOpen?.focus(), 0);
  }

  loginOpen?.addEventListener("click", () => openAuthModal("login"));
  signupOpen?.addEventListener("click", () => openAuthModal("signup"));
  authCancel?.addEventListener("click", closeAuthModal);

  // =========================
  // Backend calls (authorized)
  // =========================
  async function getAccessToken() {
    const { data } = await sbClient.auth.getSession();
    return data?.session?.access_token || "";
  }

  async function apiFetch(url, options = {}) {
    const token = await getAccessToken();
    if (!token) throw new Error("No access token. Please login again.");

    const headers = options.headers || {};
    headers["Authorization"] = `Bearer ${token}`;
    options.headers = headers;

    return fetch(url, options);
  }

  async function ensureConversation() {
    if (conversationId) return conversationId;

    const res = await apiFetch("/conversations/new", { method: "POST" });
    const data = await readTextOrJson(res);

    if (!res.ok) {
      const msg = typeof data === "string" ? data : (data?.error || JSON.stringify(data));
      throw new Error(`Conversation create failed: ${msg}`);
    }
    if (!data?.conversation_id) throw new Error("Conversation create failed: missing conversation_id");

    conversationId = data.conversation_id;
    localStorage.setItem("conversation_id", conversationId);
    return conversationId;
  }

  // =========================
  // Auth submit (hard session check)
  // =========================
  authForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (authError) authError.textContent = "";

    const email = (authEmail?.value || "").trim();
    const password = (authPassword?.value || "").trim();

    try {
      let resp;

      if (authMode === "signup") {
        resp = await sbClient.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin, // ✅ always correct
          },
        });

        if (resp.error) {
          console.log("SIGNUP ERROR:", resp.error);
          if (authError) authError.textContent = resp.error.message;
          addMessage(`Signup failed: ${resp.error.message}`, "error", ERROR_AVATAR);
          return;
        }

        closeAuthModal();

        // If confirmation is ON, session may be null (expected)
        const { data: s } = await sbClient.auth.getSession();
        console.log("SESSION AFTER SIGNUP:", s?.session);

        if (!s?.session) {
          addMessage("✅ Signup OK. Now login with the same email & password.", "error", ERROR_AVATAR);
          return;
        }

        await onAuthState();
        return;
      }

      // LOGIN
      resp = await sbClient.auth.signInWithPassword({ email, password });

      if (resp.error) {
        console.log("LOGIN ERROR:", resp.error);
        if (authError) authError.textContent = resp.error.message;
        addMessage(`Login failed: ${resp.error.message}`, "error", ERROR_AVATAR);
        return;
      }

      // ✅ Force refresh + prove session exists
      const { data: s2, error: sErr } = await sbClient.auth.getSession();
      console.log("SESSION AFTER LOGIN:", s2?.session, "sessionError:", sErr);

      if (!s2?.session?.access_token) {
        addMessage(
          "⚠️ Login returned no error but session is missing. Clear site data and try again.",
          "error",
          ERROR_AVATAR
        );
        return;
      }

      closeAuthModal();
      await onAuthState();
    } catch (err) {
      console.error("AUTH EXCEPTION:", err);
      if (authError) authError.textContent = err?.message || "Auth error";
      addMessage(`Auth error: ${err?.message || "Unknown error"}`, "error", ERROR_AVATAR);
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    await sbClient.auth.signOut();

    conversationId = "";
    localStorage.removeItem("conversation_id");

    messagesContainer.innerHTML = "";
    setPdfStatus(false);
    setEnabled(false);

    showedWelcome = false;
    showedLoginHint = false;

    if (userPill) userPill.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (loginOpen) loginOpen.style.display = "inline-flex";
    if (signupOpen) signupOpen.style.display = "inline-flex";

    if (uploadBtn) uploadBtn.style.display = "none";
    if (summarizeBtn) summarizeBtn.style.display = "none";

    addMessage("Logged out. Please login to continue.", "error", ERROR_AVATAR);
  });

  // =========================
  // Chat
  // =========================
  async function sendChatMessage(msg) {
    addMessage(msg, "user", USER_AVATAR);
    const loading = showLoading();

    try {
      await ensureConversation();

      const res = await apiFetch("/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: msg, conversation_id: conversationId }),
      });

      const data = await readTextOrJson(res);
      loading.remove();

      if (!res.ok) {
        const msg = typeof data === "string" ? data : (data?.error || JSON.stringify(data, null, 2));
        addMessage(`Server error: ${msg}`, "error", ERROR_AVATAR);
        return;
      }

      const reply = typeof data === "string" ? data : (data.reply || JSON.stringify(data));
      addMessage(reply, "aibot", BOT_AVATAR);
    } catch (e) {
      loading.remove();
      addMessage(`Error: ${e.message || "Network/server error"}`, "error", ERROR_AVATAR);
      console.error(e);
    }
  }

  // =========================
  // PDFs
  // =========================
  async function uploadAndIndexPdfs(files) {
    if (!files || !files.length) return;

    addMessage(`Uploading ${files.length} PDF(s) and building index...`, "error", ERROR_AVATAR);
    const loading = showLoading();

    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);

      const res = await apiFetch("/pdf/index", { method: "POST", body: fd });
      const data = await readTextOrJson(res);
      loading.remove();

      if (!res.ok) {
        setPdfStatus(false);
        const msg = typeof data === "string" ? data : (data?.error || JSON.stringify(data, null, 2));
        addMessage(`PDF index error: ${msg}`, "error", ERROR_AVATAR);
        return;
      }

      let details = "";
      if (typeof data === "object" && data) {
        if (data.pdf_count != null) details += `• pdfs: ${data.pdf_count} `;
        if (data.chunks != null) details += `• chunks: ${data.chunks}`;
      }
      setPdfStatus(true, details.trim());
      addMessage(`✅ PDFs indexed ${details.trim()}`.trim(), "aibot", BOT_AVATAR);
    } catch (e) {
      loading.remove();
      setPdfStatus(false);
      addMessage(`PDF error: ${e.message || "Network/server error"}`, "error", ERROR_AVATAR);
      console.error(e);
    }
  }

  async function askPdfQuestion(question) {
    addMessage(question, "user", USER_AVATAR);
    const loading = showLoading();

    try {
      const res = await apiFetch("/pdf/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, k: 12 }),
      });

      const data = await readTextOrJson(res);
      loading.remove();

      if (!res.ok) {
        const msg = typeof data === "string" ? data : (data?.error || JSON.stringify(data, null, 2));
        addMessage(`PDF ask error: ${msg}`, "error", ERROR_AVATAR);
        return;
      }

      addMessage(data.answer || "No answer returned.", "aibot", BOT_AVATAR);
    } catch (e) {
      loading.remove();
      addMessage(`PDF error: ${e.message || "Network/server error"}`, "error", ERROR_AVATAR);
      console.error(e);
    }
  }

  async function summarizeIndexedPdfs() {
    if (!pdfIndexed) {
      addMessage("⚠️ Upload PDFs first (Ask PDFs mode).", "error", ERROR_AVATAR);
      return;
    }

    addMessage("Summarizing your PDFs...", "error", ERROR_AVATAR);
    const loading = showLoading();

    try {
      const res = await apiFetch("/pdf/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k: 40 }),
      });

      const data = await readTextOrJson(res);
      loading.remove();

      if (!res.ok) {
        const msg = typeof data === "string" ? data : (data?.error || JSON.stringify(data, null, 2));
        addMessage(`PDF summarize error: ${msg}`, "error", ERROR_AVATAR);
        return;
      }

      addMessage(data.final_report || "No summary returned.", "aibot", BOT_AVATAR);
    } catch (e) {
      loading.remove();
      addMessage(`PDF error: ${e.message || "Network/server error"}`, "error", ERROR_AVATAR);
      console.error(e);
    }
  }

  // =========================
  // Events
  // =========================
  messageForm?.addEventListener("submit", (e) => {
    e.preventDefault();

    const msg = (messageInput?.value || "").trim();
    if (!msg) return;

    if (messageInput.disabled) {
      addMessage("Please login first.", "error", ERROR_AVATAR);
      return;
    }

    messageInput.value = "";
    autoGrow();

    const mode = modeSelect?.value || "chat";
    if (mode === "pdf") {
      if (!pdfIndexed) {
        addMessage("⚠️ Click “Upload PDFs” first (Ask PDFs mode).", "error", ERROR_AVATAR);
        return;
      }
      askPdfQuestion(msg);
    } else {
      sendChatMessage(msg);
    }
  });

  messageInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      messageForm.requestSubmit();
    }
  });

  newChatBtn?.addEventListener("click", async () => {
    messagesContainer.innerHTML = "";
    setPdfStatus(false);

    conversationId = "";
    localStorage.removeItem("conversation_id");

    try {
      await ensureConversation();
      addMessage("New chat started.", "error", ERROR_AVATAR);
    } catch (e) {
      addMessage(`New chat failed: ${e.message}`, "error", ERROR_AVATAR);
    }
  });

  if (uploadBtn && pdfInput) {
    uploadBtn.addEventListener("click", () => {
      pdfInput.value = "";
    });
  }

  pdfInput?.addEventListener("change", async () => {
    const files = Array.from(pdfInput.files || []);
    await uploadAndIndexPdfs(files);
    pdfInput.value = "";
  });

  summarizeBtn?.addEventListener("click", summarizeIndexedPdfs);

  modeSelect?.addEventListener("change", () => {
    const mode = modeSelect.value;

    if (mode === "pdf") {
      if (uploadBtn) uploadBtn.style.display = "inline-flex";
      if (summarizeBtn) summarizeBtn.style.display = "inline-flex";

      if (!pdfIndexed) addMessage("Ask PDFs mode enabled. Click “Upload PDFs” to add files.", "error", ERROR_AVATAR);
      else addMessage("Ask PDFs mode enabled. Ask a question about your PDFs.", "error", ERROR_AVATAR);
    } else {
      if (uploadBtn) uploadBtn.style.display = "none";
      if (summarizeBtn) summarizeBtn.style.display = "none";
    }
  });

  // =========================
  // Auth state UI
  // =========================
  async function onAuthState() {
    console.log("onAuthState origin:", window.location.origin);

    const { data } = await sbClient.auth.getSession();
    console.log("onAuthState session:", data?.session);

    const session = data?.session;

    if (!session) {
      setEnabled(false);

      if (userPill) userPill.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "none";
      if (loginOpen) loginOpen.style.display = "inline-flex";
      if (signupOpen) signupOpen.style.display = "inline-flex";

      if (uploadBtn) uploadBtn.style.display = "none";
      if (summarizeBtn) summarizeBtn.style.display = "none";

      if (!showedLoginHint) {
        addMessage("Please login to use chat and PDFs.", "error", ERROR_AVATAR);
        showedLoginHint = true;
      }
      return;
    }

    const email = session.user?.email || "User";
    if (userPill) {
      userPill.textContent = email;
      userPill.style.display = "inline-flex";
    }

    if (logoutBtn) logoutBtn.style.display = "inline-flex";
    if (loginOpen) loginOpen.style.display = "none";
    if (signupOpen) signupOpen.style.display = "none";

    setEnabled(true);

    try {
      await ensureConversation();
    } catch (e) {
      addMessage(`Backend error: ${e.message}`, "error", ERROR_AVATAR);
      console.error(e);
      return;
    }

    if (!showedWelcome) {
      addMessage("✅ Logged in. You can chat or switch to Ask PDFs mode.", "error", ERROR_AVATAR);
      showedWelcome = true;
    }
  }

  // Init
  setPdfStatus(false);
  setEnabled(false);
  onAuthState();

  // ✅ Only reset on SIGNED_OUT, not token refresh
  sbClient.auth.onAuthStateChange(async (event) => {
    if (authChangeHandling) return;
    authChangeHandling = true;

    if (event === "SIGNED_OUT") {
      conversationId = "";
      localStorage.removeItem("conversation_id");
      messagesContainer.innerHTML = "";
      setPdfStatus(false);

      showedWelcome = false;
      showedLoginHint = false;
    }

    await onAuthState();
    setTimeout(() => (authChangeHandling = false), 250);
  });
});
