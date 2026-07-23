"use strict";

// ==========================================
// NOXXY — Dashboard Application
// ==========================================

const API = {
  base: "",
  async post(path, body) {
    const r = await fetch(API.base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return r.json();
  },
  async get(path) {
    const r = await fetch(API.base + path);
    return r.json();
  },
  async del(path) {
    const r = await fetch(API.base + path, { method: "DELETE" });
    return r.json();
  }
};

// ==========================================
// STATE
// ==========================================

const state = {
  currentAddress: null,
  currentInbox: null,
  sessionId: null,
  emails: [],
  selectedEmailId: null,
  selectedEmailData: null,
  domains: [],
  currentView: "inbox"
};

// ==========================================
// STORAGE
// ==========================================

const store = {
  get(key) { try { return JSON.parse(localStorage.getItem("ngt_" + key)); } catch { return null; } },
  set(key, val) { try { localStorage.setItem("ngt_" + key, JSON.stringify(val)); } catch {} },
};

// ==========================================
// TOAST
// ==========================================

function toast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toastContainer");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = "slideOut 0.25s ease forwards";
    setTimeout(() => el.remove(), 250);
  }, duration);
}

// ==========================================
// FORMATTING
// ==========================================

function formatTime(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function getInitial(name, address) {
  const src = name || address || "?";
  return src.trim().charAt(0).toUpperCase();
}

function avatarColor(str) {
  const colors = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#ec4899"];
  let h = 0;
  for (const c of (str || "")) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}

function humanSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B","KB","MB","GB"];
  let i = 0;
  while (bytes >= 1024 && i < 3) { bytes /= 1024; i++; }
  return bytes.toFixed(1) + " " + units[i];
}

// ==========================================
// DOMAINS
// ==========================================

async function loadDomains() {
  try {
    const res = await API.get("/api/domains");
    state.domains = res.domains || ["noxxyrorr.biz.id"];
  } catch {
    state.domains = ["noxxyrorr.biz.id"];
  }
  renderDomainSelects();
}

function renderDomainSelects() {
  const selects = [
    document.getElementById("domainSelect"),
    document.getElementById("customDomainSelect")
  ];
  selects.forEach(sel => {
    if (!sel) return;
    sel.innerHTML = state.domains.map(d => `<option value="${d}">${d}</option>`).join("");
  });
}

// ==========================================
// INBOX CREATION
// ==========================================

async function createInbox(username, domain) {
  const sessionId = state.sessionId || generateSessionId();
  state.sessionId = sessionId;
  store.set("sessionId", sessionId);

  updateStatus("connecting");
  setAddressText("Generating...");

  try {
    const res = await API.post("/api/inbox", { username, domain, sessionId });
    if (!res.success) {
      toast(res.error || "Failed to create inbox", "error");
      return;
    }

    state.currentAddress = res.inbox.address;
    state.currentInbox = res.inbox;
    state.emails = res.emails || [];
    state.selectedEmailId = null;

    store.set("lastAddress", res.inbox.address);
    addToHistory(res.inbox);

    setAddressText(state.currentAddress);
    updateDomainSelect(res.inbox.domain);
    renderEmailList();
    resetViewer();
    // connectSSE(state.currentAddress);
    // startPolling();
    updateAnalytics();
    updateSettings();
    toast("Inbox ready", "success");
  } catch (err) {
    console.error(err);
    toast("Network error. Retrying...", "error");
    updateStatus("disconnected");
  }
}

function generateSessionId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function loadExistingInbox(address) {
  try {
    const res = await API.get(`/api/inbox?address=${encodeURIComponent(address)}`);
    if (res.success) {
      state.currentAddress = res.inbox.address;
      state.currentInbox = res.inbox;
      state.emails = res.emails || [];
      setAddressText(state.currentAddress);
      updateDomainSelect(res.inbox.domain);
      renderEmailList();
      // connectSSE(state.currentAddress);
      // startPolling();
      updateAnalytics();
      updateSettings();
      return true;
    }
  } catch {}
  return false;
}

function addToHistory(inbox) {
  const history = store.get("history") || [];
  const idx = history.findIndex(h => h.address === inbox.address);
  if (idx !== -1) history.splice(idx, 1);
  history.unshift({ address: inbox.address, domain: inbox.domain, createdAt: inbox.createdAt || new Date().toISOString() });
  if (history.length > 20) history.pop();
  store.set("history", history);
  renderHistory();
}

// ==========================================
// SSE — REAL-TIME
// ==========================================

async function refreshInbox() {
  if (!state.currentAddress) return;

  try {
    const res = await API.get(
      `/api/inbox?address=${encodeURIComponent(state.currentAddress)}`
    );

    if (res.success) {
      state.emails = res.emails || [];
      renderEmailList();
      updateAnalytics();
      updateStatus("connected");
    }
  } catch (err) {
    updateStatus("disconnected");
  }
}

function updateStatus(status) {
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  dot.className = "status-dot " + status;
  const labels = { connected: "Live", connecting: "Connecting", disconnected: "Offline" };
  text.textContent = labels[status] || status;
}

// ==========================================
// EMAIL LIST
// ==========================================

function renderEmailList() {
  const list = document.getElementById("emailList");
  const empty = document.getElementById("emptyState");
  const countEl = document.getElementById("emailCount");

  const unread = state.emails.filter(e => !e.read).length;
  countEl.textContent = `Inbox${unread ? ` (${unread})` : ""}`;

  if (!state.emails.length) {
    empty.style.display = "flex";
    list.querySelectorAll(".email-item").forEach(el => el.remove());
    return;
  }

  empty.style.display = "none";

  const existing = new Set(Array.from(list.querySelectorAll(".email-item")).map(el => el.dataset.id));
  const incoming = new Set(state.emails.map(e => String(e._id)));

  list.querySelectorAll(".email-item").forEach(el => {
    if (!incoming.has(el.dataset.id)) el.remove();
  });

  state.emails.forEach((email, idx) => {
    const id = String(email._id);
    let item = list.querySelector(`.email-item[data-id="${id}"]`);
    const isActive = state.selectedEmailId === id;
    const isUnread = !email.read;
    const isSpam = (email.spamScore || 0) >= 50;

    const fromName = email.from?.name || email.from?.address || "Unknown";
    const preview = (email.text || "").replace(/\s+/g, " ").trim().slice(0, 80);

    if (!item) {
      item = document.createElement("div");
      item.className = "email-item";
      item.dataset.id = id;
      item.addEventListener("click", () => selectEmail(id));
    }

    item.className = `email-item${isActive ? " active" : ""}${isUnread ? " unread" : ""}`;
    item.innerHTML = `
      <div class="email-item-from">
        <span class="email-item-sender">${escHtml(fromName)}${isSpam ? '<span class="spam-badge">SPAM</span>' : ""}</span>
        <span class="email-item-time">${formatTime(email.receivedAt)}</span>
      </div>
      <div class="email-item-subject">${escHtml(email.subject || "(No Subject)")}</div>
      <div class="email-item-preview">${escHtml(preview || "No preview available")}</div>
    `;

    if (!existing.has(id)) {
      if (idx === 0) {
        list.insertBefore(item, list.querySelector(".email-item") || empty);
      } else {
        list.appendChild(item);
      }
    }
  });
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ==========================================
// EMAIL VIEWER
// ==========================================

async function selectEmail(id) {
  state.selectedEmailId = id;

  list_update_active(id);

  const localEmail = state.emails.find(e => String(e._id) === id);
  if (localEmail) localEmail.read = true;

  try {
    const res = await API.get(`/api/emails/${id}`);
    if (!res.success) { toast("Failed to load email", "error"); return; }
    renderEmailViewer(res.email);
    state.selectedEmailData = res.email;
  } catch (err) {
    toast("Failed to load email", "error");
  }
}

function list_update_active(id) {
  document.querySelectorAll(".email-item").forEach(el => {
    el.classList.toggle("active", el.dataset.id === id);
    if (el.dataset.id === id) el.classList.remove("unread");
  });
}

function renderEmailViewer(email) {
  document.getElementById("viewerPlaceholder").classList.add("hidden");
  const content = document.getElementById("emailContent");
  content.classList.remove("hidden");

  const fromName = email.from?.name || email.from?.address || "Unknown";
  const fromAddr = email.from?.address || "";
  const initial = getInitial(fromName, fromAddr);
  const color = avatarColor(fromAddr);

  const avatar = document.getElementById("senderAvatar");
  avatar.textContent = initial;
  avatar.style.background = color;

  document.getElementById("emailSubjectFull").textContent = email.subject || "(No Subject)";
  document.getElementById("emailFromFull").textContent = `${fromName} <${fromAddr}>`;
  document.getElementById("emailDateFull").textContent = formatDate(email.receivedAt);

  const frame = document.getElementById("emailFrame");
  if (email.html) {
    const blob = new Blob([email.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    frame.src = url;
    document.getElementById("emailBodyHtml").classList.remove("hidden");
  } else {
    document.getElementById("emailBodyHtml").classList.add("hidden");
  }

  const textEl = document.getElementById("emailBodyText");
  textEl.textContent = email.text || "(No text content)";

  const attEl = document.getElementById("emailAttachments");
  attEl.innerHTML = "";
  if (email.attachments?.length) {
    email.attachments.forEach(att => {
      const chip = document.createElement("div");
      chip.className = "attachment-chip";
      chip.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"/></svg> ${escHtml(att.filename)} <span style="color:var(--text-tertiary)">${humanSize(att.size)}</span>`;
      attEl.appendChild(chip);
    });
  }

  setActiveTab("html");
}

function setActiveTab(tab) {
  document.querySelectorAll(".render-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  document.getElementById("emailBodyHtml").classList.toggle("hidden", tab !== "html");
  document.getElementById("emailBodyText").classList.toggle("hidden", tab !== "text");
}

function resetViewer() {
  state.selectedEmailId = null;
  state.selectedEmailData = null;
  document.getElementById("viewerPlaceholder").classList.remove("hidden");
  document.getElementById("emailContent").classList.add("hidden");
}

// ==========================================
// ANALYTICS
// ==========================================

function updateAnalytics() {
  const total = state.emails.length;
  const unread = state.emails.filter(e => !e.read).length;
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statUnread").textContent = unread;

  if (state.currentInbox) {
    const created = new Date(state.currentInbox.createdAt || Date.now());
    const ageMs = Date.now() - created;
    const ageHours = Math.floor(ageMs / 3600000);
    const ageMins = Math.floor((ageMs % 3600000) / 60000);
    document.getElementById("statAge").textContent = ageHours > 0 ? `${ageHours}h ${ageMins}m` : `${ageMins}m`;

    const expires = new Date(state.currentInbox.expiresAt);
    const remainMs = expires - Date.now();
    if (remainMs > 0) {
      const remH = Math.floor(remainMs / 3600000);
      const remM = Math.floor((remainMs % 3600000) / 60000);
      document.getElementById("statExpiry").textContent = `${remH}h ${remM}m`;
    } else {
      document.getElementById("statExpiry").textContent = "Expired";
    }
  }
}

// ==========================================
// HISTORY
// ==========================================

function renderHistory() {
  const container = document.getElementById("historyList");
  const history = store.get("history") || [];
  if (!history.length) {
    container.innerHTML = `<p style="color:var(--text-tertiary);font-size:13px">No history yet. Generated inboxes will appear here.</p>`;
    return;
  }
  container.innerHTML = history.map(h => `
    <div class="history-card${h.address === state.currentAddress ? " current" : ""}" data-address="${escHtml(h.address)}">
      <div>
        <div class="history-address">${escHtml(h.address)}</div>
        <div class="history-meta">Created ${formatDate(h.createdAt)}</div>
      </div>
      <div class="history-actions">
        <button class="btn btn-ghost btn-sm" onclick="restoreInbox('${escHtml(h.address)}')">Restore</button>
        <button class="btn btn-ghost btn-sm" onclick="copyText('${escHtml(h.address)}')">Copy</button>
      </div>
    </div>
  `).join("");
}

async function restoreInbox(address) {
  const ok = await loadExistingInbox(address);
  if (!ok) {
    toast("Inbox expired or not found. Creating new one...", "info");
    await createInbox();
  } else {
    toast("Inbox restored", "success");
    switchView("inbox");
  }
}

// ==========================================
// SETTINGS
// ==========================================

function updateSettings() {
  const addr = state.currentAddress || "—";
  const el = document.getElementById("settingAddress");
  if (el) el.textContent = addr;
}

// ==========================================
// DOMAIN SELECT SYNC
// ==========================================

function updateDomainSelect(domain) {
  const sel = document.getElementById("domainSelect");
  if (sel && domain) sel.value = domain;
}

// ==========================================
// VIEWS
// ==========================================

function switchView(view) {
  state.currentView = view;
  document.querySelectorAll(".view").forEach(el => el.classList.toggle("hidden", el.id !== `view-${view}`));
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));

  if (view === "history") renderHistory();
  if (view === "analytics") updateAnalytics();
}

// ==========================================
// ADDRESS BAR HELPERS
// ==========================================

function setAddressText(text) {
  document.getElementById("currentAddress").textContent = text;
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => toast("Copied to clipboard", "success")).catch(() => toast("Copy failed", "error"));
}

// ==========================================
// MODALS
// ==========================================

function openSourceModal() {
  if (!state.selectedEmailData) return;
  const code = JSON.stringify(state.selectedEmailData, null, 2);
  document.getElementById("sourceCode").textContent = code;
  document.getElementById("sourceModal").classList.remove("hidden");
}

function closeSourceModal() {
  document.getElementById("sourceModal").classList.add("hidden");
}

function openHeadersModal() {
  if (!state.selectedEmailData) return;
  const headers = state.selectedEmailData.headers || {};
  const list = document.getElementById("headersList");
  list.innerHTML = Object.entries(headers).map(([k, v]) => `
    <div class="header-row">
      <span class="header-key">${escHtml(k)}</span>
      <span class="header-value">${escHtml(v)}</span>
    </div>
  `).join("") || "<p style='color:var(--text-tertiary);font-size:13px'>No headers available</p>";
  document.getElementById("headersModal").classList.remove("hidden");
}

function closeHeadersModal() {
  document.getElementById("headersModal").classList.add("hidden");
}

// ==========================================
// DELETE EMAIL
// ==========================================

async function deleteSelectedEmail() {
  if (!state.selectedEmailId) return;
  const id = state.selectedEmailId;
  try {
    const res = await API.del(`/api/emails/${id}`);
    if (res.success) {
      state.emails = state.emails.filter(e => String(e._id) !== id);
      resetViewer();
      renderEmailList();
      updateAnalytics();
      toast("Email deleted", "success");
    } else {
      toast("Failed to delete email", "error");
    }
  } catch {
    toast("Failed to delete email", "error");
  }
}

async function clearAllEmails() {
  if (!confirm("Delete all emails in this inbox? This cannot be undone.")) return;
  const ids = state.emails.map(e => String(e._id));
  let deleted = 0;
  for (const id of ids) {
    try {
      const res = await API.del(`/api/emails/${id}`);
      if (res.success) deleted++;
    } catch {}
  }
  state.emails = [];
  resetViewer();
  renderEmailList();
  updateAnalytics();
  toast(`Deleted ${deleted} email${deleted !== 1 ? "s" : ""}`, "success");
}

// ==========================================
// SIDEBAR TOGGLE (mobile)
// ==========================================

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
}

// ==========================================
// EVENT BINDING
// ==========================================

function bindEvents() {
  document.getElementById("generateBtn").addEventListener("click", () => {
    const domain = document.getElementById("domainSelect").value;
    createInbox(null, domain);
  });

  document.getElementById("copyBtn").addEventListener("click", () => {
    if (state.currentAddress) copyText(state.currentAddress);
    else toast("No address yet", "info");
  });

  document.getElementById("refreshBtn").addEventListener("click", async () => {
    if (!state.currentAddress) return;
    await refreshInbox();
    toast("Refreshed", "info");
  });

  document.getElementById("sidebarToggle").addEventListener("click", toggleSidebar);

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      switchView(btn.dataset.view);
      document.getElementById("sidebar").classList.remove("open");
    });
  });

  document.querySelectorAll(".render-tab").forEach(tab => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
  });

  document.getElementById("viewSourceBtn").addEventListener("click", openSourceModal);
  document.getElementById("viewHeadersBtn").addEventListener("click", openHeadersModal);
  document.getElementById("deleteEmailBtn").addEventListener("click", deleteSelectedEmail);

  document.getElementById("sourceModalClose").addEventListener("click", closeSourceModal);
  document.getElementById("sourceModalBackdrop").addEventListener("click", closeSourceModal);
  document.getElementById("headersModalClose").addEventListener("click", closeHeadersModal);
  document.getElementById("headersModalBackdrop").addEventListener("click", closeHeadersModal);

  document.getElementById("settingCopyBtn").addEventListener("click", () => {
    if (state.currentAddress) copyText(state.currentAddress);
  });

  document.getElementById("clearAllBtn").addEventListener("click", clearAllEmails);

  document.getElementById("customToggle").addEventListener("click", () => {
    document.getElementById("customAddressForm").classList.toggle("hidden");
  });

  document.getElementById("customCancelBtn").addEventListener("click", () => {
    document.getElementById("customAddressForm").classList.add("hidden");
  });

  document.getElementById("customGenerateBtn").addEventListener("click", () => {
    const username = document.getElementById("customUsername").value.trim().toLowerCase();
    const domain = document.getElementById("customDomainSelect").value;
    if (!username || !/^[a-z0-9._-]{3,30}$/.test(username)) {
      toast("Invalid username. Use 3-30 chars: letters, numbers, dots, hyphens", "error");
      return;
    }
    document.getElementById("customAddressForm").classList.add("hidden");
    document.getElementById("customUsername").value = "";
    createInbox(username, domain);
  });

  document.getElementById("domainSelect").addEventListener("change", function () {
    if (state.currentAddress) {
      const username = state.currentAddress.split("@")[0];
      createInbox(username, this.value);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeSourceModal();
      closeHeadersModal();
      document.getElementById("sidebar").classList.remove("open");
    }
  });
}

// ==========================================
// INIT
// ==========================================

async function init() {
  bindEvents();
  await loadDomains();

  const sessionId = store.get("sessionId");
  const lastAddress = store.get("lastAddress");
  state.sessionId = sessionId;
  if (lastAddress) {
    const ok = await loadExistingInbox(lastAddress);
    if (!ok) await createInbox();
  } else {
    await createInbox();
  }

  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

document.addEventListener("DOMContentLoaded", init);

window.restoreInbox = restoreInbox;
window.copyText = copyText;
