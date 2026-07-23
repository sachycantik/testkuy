"use strict";

const byId = id => document.getElementById(id);

const storage = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(`ng_${key}`));
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`ng_${key}`, JSON.stringify(value));
    } catch {
      // The app remains usable when private browsing blocks storage.
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(`ng_${key}`);
    } catch {
      // Ignore unavailable storage.
    }
  }
};

const state = {
  address: null,
  inbox: null,
  sessionId: null,
  emails: [],
  selectedId: null,
  selectedEmail: null,
  domains: [],
  preferredDomain: null,
  eventSource: null,
  pollTimer: null,
  frameUrl: null
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok && !payload.error) {
    payload.error = `Permintaan gagal (${response.status})`;
  }
  return payload;
}

function showToast(message, type = "info", duration = 3000) {
  const toast = document.createElement("div");
  toast.className = `toast${type === "success" ? " is-success" : type === "error" ? " is-error" : ""}`;
  toast.textContent = message;
  byId("toasts").appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 180);
  }, duration);
}

function setStatus(status) {
  const element = byId("serviceStatus");
  const labels = {
    online: "Inbox aktif",
    connecting: "Menghubungkan",
    offline: "Koneksi terputus"
  };

  element.className = `service-status is-${status}`;
  byId("statusText").textContent = labels[status] || labels.offline;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getInitials(value) {
  const parts = String(value || "?").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
}

function formatRelativeTime(value) {
  const date = new Date(value);
  const difference = Date.now() - date.getTime();

  if (!Number.isFinite(date.getTime())) return "";
  if (difference < 60_000) return "Baru saja";
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)} mnt`;
  if (difference < 86_400_000) {
    return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function formatFullDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function createSessionId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(value => value.toString(16).padStart(2, "0"))
    .join("");
}

async function loadDomains() {
  try {
    const payload = await request("/api/domains");
    state.domains = payload.domains?.length ? payload.domains : ["noxxyrorr.biz.id"];
  } catch {
    state.domains = ["noxxyrorr.biz.id"];
  }

  const hostname = window.location.hostname;
  state.preferredDomain = state.domains.find(domain =>
    hostname === domain || hostname.endsWith(`.${domain}`)
  ) || state.domains[0];

  [byId("domainSelect"), byId("customDomain")].forEach(select => {
    select.replaceChildren(...state.domains.map(domain => {
      const option = new Option(domain, domain, false, domain === state.preferredDomain);
      return option;
    }));
  });
}

function syncInbox(inbox, emails = []) {
  state.address = inbox.address;
  state.inbox = inbox;
  state.emails = emails;
  state.selectedId = null;
  state.selectedEmail = null;

  byId("addressText").textContent = inbox.address;
  if (inbox.domain) byId("domainSelect").value = inbox.domain;
  storage.set("addr", inbox.address);

  resetViewer();
  renderMessages();
  connectRealtime(inbox.address);
  setStatus("online");
}

async function createInbox(username = null, domain = null) {
  setStatus("connecting");
  byId("addressText").textContent = "Menyiapkan alamat…";

  state.sessionId ||= storage.get("sid") || createSessionId();
  storage.set("sid", state.sessionId);

  try {
    const payload = await request("/api/inbox", {
      method: "POST",
      body: JSON.stringify({
        username,
        domain: domain || byId("domainSelect").value,
        sessionId: state.sessionId
      })
    });

    if (!payload.success) {
      throw new Error(payload.error || "Alamat tidak dapat dibuat");
    }

    syncInbox(payload.inbox, payload.emails || []);
    showToast("Inbox siap digunakan", "success");
  } catch (error) {
    setStatus("offline");
    byId("addressText").textContent = "Gagal menyiapkan alamat";
    showToast(error.message || "Terjadi gangguan jaringan", "error");
  }
}

async function loadInbox(address, { silent = false } = {}) {
  if (!address) return false;

  try {
    const payload = await request(`/api/inbox?address=${encodeURIComponent(address)}`);
    if (!payload.success) return false;

    state.address = payload.inbox.address;
    state.inbox = payload.inbox;
    state.emails = payload.emails || [];
    byId("addressText").textContent = state.address;
    if (payload.inbox.domain) byId("domainSelect").value = payload.inbox.domain;

    renderMessages();
    setStatus("online");
    if (!silent) showToast("Inbox diperbarui", "success");
    return true;
  } catch {
    setStatus("offline");
    if (!silent) showToast("Inbox gagal diperbarui", "error");
    return false;
  }
}

function renderMessages() {
  const list = byId("emailList");
  const empty = byId("emptyState");
  const messageCount = state.emails.length;

  byId("inboxCount").textContent = `${messageCount} pesan`;

  list.querySelectorAll(".message-card").forEach(card => card.remove());
  empty.hidden = messageCount > 0;

  if (!messageCount) return;

  const fragment = document.createDocumentFragment();
  state.emails.forEach(email => {
    const id = String(email._id);
    const sender = email.from?.name || email.from?.address || "Pengirim tidak dikenal";
    const preview = String(email.text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 95);
    const isSpam = Number(email.spamScore || 0) >= 50;

    const card = document.createElement("button");
    card.type = "button";
    card.className = [
      "message-card",
      !email.read ? "is-unread" : "",
      state.selectedId === id ? "is-active" : ""
    ].filter(Boolean).join(" ");
    card.dataset.id = id;
    card.setAttribute("role", "listitem");
    card.innerHTML = `
      <span class="message-avatar" aria-hidden="true">${escapeHtml(getInitials(sender))}</span>
      <span class="message-main">
        <span class="message-top">
          <span class="message-sender">${escapeHtml(sender)}${isSpam ? '<span class="spam-badge">SPAM</span>' : ""}</span>
          <time class="message-time">${escapeHtml(formatRelativeTime(email.receivedAt))}</time>
        </span>
        <span class="message-subject">${escapeHtml(email.subject || "(Tanpa subjek)")}</span>
        <span class="message-preview">${escapeHtml(preview || "Tidak ada pratinjau pesan")}</span>
      </span>`;
    card.addEventListener("click", () => selectEmail(id));
    fragment.appendChild(card);
  });

  list.appendChild(fragment);
}

async function selectEmail(id) {
  state.selectedId = id;
  const localEmail = state.emails.find(email => String(email._id) === id);
  if (localEmail) localEmail.read = true;
  renderMessages();

  try {
    const payload = await request(`/api/emails/${encodeURIComponent(id)}`);
    if (!payload.success) throw new Error(payload.error);
    state.selectedEmail = payload.email;
    renderEmail(payload.email);
  } catch {
    showToast("Email gagal dimuat", "error");
  }
}

function renderEmail(email) {
  const sender = email.from?.name || email.from?.address || "Pengirim tidak dikenal";
  const senderAddress = email.from?.address || "";

  byId("viewerEmpty").hidden = true;
  byId("emailContent").hidden = false;
  byId("senderAvatar").textContent = getInitials(sender);
  byId("emailSubject").textContent = email.subject || "(Tanpa subjek)";
  byId("emailFrom").textContent = senderAddress && sender !== senderAddress
    ? `${sender} <${senderAddress}>`
    : sender;
  byId("emailDate").textContent = formatFullDate(email.receivedAt);
  byId("emailDate").dateTime = new Date(email.receivedAt).toISOString();
  byId("emailText").textContent = email.text || "(Tidak ada konten teks)";

  const frame = byId("emailFrame");
  if (state.frameUrl) URL.revokeObjectURL(state.frameUrl);
  const safeHtml = email.html || `
    <!doctype html>
    <html><head><meta charset="utf-8"></head>
    <body style="margin:0;padding:24px;font:14px/1.65 system-ui,sans-serif;color:#1f2937;white-space:pre-wrap">${escapeHtml(email.text || "(Tidak ada konten)")}</body></html>`;
  state.frameUrl = URL.createObjectURL(new Blob([safeHtml], { type: "text/html" }));
  frame.src = state.frameUrl;
  frame.onload = resizeEmailFrame;

  renderAttachments(email.attachments || []);
  setViewerTab(email.html ? "html" : "text");
}

function resizeEmailFrame() {
  const frame = byId("emailFrame");
  try {
    const documentHeight = Math.max(
      frame.contentDocument.documentElement.scrollHeight,
      frame.contentDocument.body?.scrollHeight || 0
    );
    frame.style.height = `${Math.max(documentHeight, 375)}px`;
  } catch {
    frame.style.height = "500px";
  }
}

function renderAttachments(attachments) {
  const list = byId("attachmentList");
  list.replaceChildren();
  list.hidden = attachments.length === 0;

  attachments.forEach(attachment => {
    const item = document.createElement("div");
    item.className = "attachment-item";
    item.innerHTML = `
      <span>${escapeHtml(attachment.filename || "Lampiran")}</span>
      <span class="attachment-size">${escapeHtml(formatSize(attachment.size))}</span>`;
    list.appendChild(item);
  });
}

function setViewerTab(tab) {
  const showHtml = tab === "html";
  byId("emailFrame").hidden = !showHtml;
  byId("emailText").hidden = showHtml;

  document.querySelectorAll(".viewer-tab").forEach(button => {
    const active = button.dataset.tab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function resetViewer() {
  state.selectedId = null;
  state.selectedEmail = null;
  byId("viewerEmpty").hidden = false;
  byId("emailContent").hidden = true;

  if (state.frameUrl) {
    URL.revokeObjectURL(state.frameUrl);
    state.frameUrl = null;
  }
}

async function deleteSelectedEmail() {
  if (!state.selectedId) return;
  if (!window.confirm("Hapus email ini secara permanen?")) return;

  try {
    const payload = await request(`/api/emails/${encodeURIComponent(state.selectedId)}`, {
      method: "DELETE"
    });
    if (!payload.success) throw new Error(payload.error);

    state.emails = state.emails.filter(email => String(email._id) !== state.selectedId);
    resetViewer();
    renderMessages();
    showToast("Email berhasil dihapus", "success");
  } catch {
    showToast("Email gagal dihapus", "error");
  }
}

async function copyAddress() {
  if (!state.address) return;
  try {
    await navigator.clipboard.writeText(state.address);
    showToast("Alamat berhasil disalin", "success");
  } catch {
    const fallback = document.createElement("textarea");
    fallback.value = state.address;
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.appendChild(fallback);
    fallback.select();
    const copied = document.execCommand("copy");
    fallback.remove();
    showToast(copied ? "Alamat berhasil disalin" : "Alamat gagal disalin", copied ? "success" : "error");
  }
}

function connectRealtime(address) {
  stopRealtime();
  if (!window.EventSource || !address) {
    startPolling();
    return;
  }

  const source = new EventSource(`/api/stream?address=${encodeURIComponent(address)}`);
  state.eventSource = source;

  source.addEventListener("connected", () => setStatus("online"));
  source.addEventListener("new_email", event => {
    try {
      const email = JSON.parse(event.data);
      const id = String(email._id);
      if (!state.emails.some(item => String(item._id) === id)) {
        state.emails.unshift(email);
        renderMessages();
        showToast(`Email baru dari ${email.from?.name || email.from?.address || "pengirim"}`, "success");
      }
    } catch {
      // Ignore malformed realtime events and let polling reconcile the inbox.
    }
  });
  source.onerror = () => {
    setStatus("offline");
    source.close();
    state.eventSource = null;
    startPolling();
  };

  startPolling();
}

function startPolling() {
  if (state.pollTimer) window.clearInterval(state.pollTimer);
  state.pollTimer = window.setInterval(() => {
    if (!document.hidden && state.address) loadInbox(state.address, { silent: true });
  }, 15_000);
}

function stopRealtime() {
  if (state.eventSource) state.eventSource.close();
  if (state.pollTimer) window.clearInterval(state.pollTimer);
  state.eventSource = null;
  state.pollTimer = null;
}

function setCustomForm(open) {
  const form = byId("customForm");
  form.hidden = !open;
  byId("customToggle").setAttribute("aria-expanded", String(open));
  if (open) byId("customUser").focus();
}

function bindEvents() {
  byId("copyBtn").addEventListener("click", copyAddress);
  byId("genBtn").addEventListener("click", () => createInbox(null, byId("domainSelect").value));
  byId("refreshBtn").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.classList.add("is-spinning");
    await loadInbox(state.address);
    window.setTimeout(() => button.classList.remove("is-spinning"), 350);
  });

  byId("customToggle").addEventListener("click", () => setCustomForm(byId("customForm").hidden));
  byId("customCancel").addEventListener("click", () => setCustomForm(false));
  byId("customForm").addEventListener("submit", event => {
    event.preventDefault();
    const username = byId("customUser").value.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      showToast("Nama alamat belum valid", "error");
      byId("customUser").focus();
      return;
    }

    setCustomForm(false);
    byId("customUser").value = "";
    createInbox(username, byId("customDomain").value);
  });

  document.querySelectorAll(".viewer-tab").forEach(button => {
    button.addEventListener("click", () => setViewerTab(button.dataset.tab));
  });
  byId("deleteBtn").addEventListener("click", deleteSelectedEmail);

  byId("domainSelect").addEventListener("change", event => {
    if (!state.address) return;
    const username = state.address.split("@")[0];
    createInbox(username, event.target.value);
  });

  window.addEventListener("beforeunload", stopRealtime);
}

async function init() {
  bindEvents();
  byId("currentYear").textContent = new Date().getFullYear();

  await loadDomains();
  state.sessionId = storage.get("sid");

  const storedAddress = storage.get("addr");
  const storedDomain = storedAddress?.split("@")[1];
  const domainStillActive = state.domains.includes(storedDomain);

  const restored = storedAddress && domainStillActive
    ? await loadInbox(storedAddress, { silent: true })
    : false;

  if (restored) {
    connectRealtime(state.address);
  } else {
    if (storedAddress) storage.remove("addr");
    await createInbox();
  }

  byId("loadingScreen").classList.add("is-hidden");
  window.setTimeout(() => byId("loadingScreen").remove(), 250);
}

document.addEventListener("DOMContentLoaded", init);
