// messages.js — TeleSyriana Chat System (Rooms + DM + Floating)
// ✅ No default room
// ✅ No duplication
// ✅ Floating disabled inside Messages page
// ✅ Direct Messages supported
// ✅ AI room (Coming soon)

import { db, fs } from "./firebase.js";
const { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } = fs;

const USER_KEY = "telesyrianaUser";
const MESSAGES_COL = "globalMessages";

let currentUser = null;
let currentRoom = null; // ✅ no default
let unsubscribeMain = null;
let unsubscribeFloat = null;

/* ---------------- helpers ---------------- */

function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function clearMessages(listEl) {
  listEl.innerHTML = "";
}

function setInputEnabled(enabled) {
  const input = document.getElementById("chat-input");
  const btn = document.querySelector(".chat-send-btn");
  if (!input || !btn) return;
  input.disabled = !enabled;
  btn.disabled = !enabled;
}

/* ---------------- rendering ---------------- */

function renderMessages(listEl, docs, showRole = true) {
  clearMessages(listEl);

  const frag = document.createDocumentFragment();
  docs.forEach((m) => {
    const wrap = document.createElement("div");
    wrap.className = "chat-message";
    if (currentUser && m.userId === currentUser.id) wrap.classList.add("me");

    const meta = document.createElement("div");
    meta.className = "chat-message-meta";
    meta.textContent = showRole
      ? `${m.name} (${m.role}) • ${formatTime(m.ts)}`
      : `${m.name} • ${formatTime(m.ts)}`;

    const text = document.createElement("div");
    text.className = "chat-message-text";
    text.textContent = m.text;

    wrap.appendChild(meta);
    wrap.appendChild(text);
    frag.appendChild(wrap);
  });

  listEl.appendChild(frag);
  listEl.scrollTop = listEl.scrollHeight;
}

/* ---------------- subscriptions ---------------- */

function subscribeToRoom(roomId, listEl, showRole = true) {
  unsubscribeMain?.();
  clearMessages(listEl);

  const q = query(
    collection(db, MESSAGES_COL),
    where("room", "==", roomId),
    orderBy("ts", "asc")
  );

  unsubscribeMain = onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach((d) => rows.push(d.data()));
    renderMessages(listEl, rows, showRole);
  });
}

/* ---------------- init ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  currentUser = getUser();

  const listEl = document.getElementById("chat-message-list");
  const emptyEl = document.getElementById("chat-empty");
  const formEl = document.getElementById("chat-form");
  const inputEl = document.getElementById("chat-input");

  const roomNameEl = document.getElementById("chat-room-name");
  const roomDescEl = document.getElementById("chat-room-desc");

  const floatToggle = document.getElementById("float-chat-toggle");
  const floatPanel = document.getElementById("float-chat-panel");
  const floatClose = document.getElementById("float-chat-close");
  const floatList = document.getElementById("float-chat-messages");
  const floatForm = document.getElementById("float-chat-form");
  const floatInput = document.getElementById("float-chat-input");

  /* ---------- floating visibility ---------- */
  const isMessagesPage = document.getElementById("page-messages")?.classList.contains("hidden") === false;
  if (floatToggle) {
    if (!currentUser || isMessagesPage) floatToggle.classList.add("hidden");
    else floatToggle.classList.remove("hidden");
  }

  /* ---------- rooms ---------- */
  document.querySelectorAll(".chat-room").forEach((btn) => {
    btn.addEventListener("click", () => {
      const room = btn.dataset.room;

      document.getElementById("chat-empty").style.display = "none";
      setInputEnabled(room !== "ai");

      if (room === "ai") {
        unsubscribeMain?.();
        clearMessages(listEl);
        roomNameEl.textContent = "ChatGPT 5";
        roomDescEl.textContent = "Coming soon…";
        const msg = document.createElement("div");
        msg.style.padding = "12px";
        msg.style.color = "#777";
        msg.textContent = "🤖 ChatGPT assistant is coming soon.";
        listEl.appendChild(msg);
        return;
      }

      currentRoom = room;
      roomNameEl.textContent = btn.querySelector(".chat-room-title").textContent;
      roomDescEl.textContent = btn.querySelector(".chat-room-sub").textContent;

      subscribeToRoom(room, listEl, true);
    });
  });

  /* ---------- direct messages ---------- */
  document.querySelectorAll(".chat-dm").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!currentUser) return;

      const otherId = btn.dataset.dm;
      const ids = [currentUser.id, otherId].sort();
      const roomId = `dm_${ids[0]}_${ids[1]}`;

      document.getElementById("chat-empty").style.display = "none";
      setInputEnabled(true);

      currentRoom = roomId;
      roomNameEl.textContent = btn.querySelector(".chat-room-title").textContent;
      roomDescEl.textContent = "Direct message";

      subscribeToRoom(roomId, listEl, false);
    });
  });

  /* ---------- send (main chat) ---------- */
  formEl?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentRoom || !currentUser) return;

    const text = inputEl.value.trim();
    if (!text) return;

    await addDoc(collection(db, MESSAGES_COL), {
      room: currentRoom,
      text,
      userId: currentUser.id,
      name: currentUser.name,
      role: currentUser.role,
      ts: serverTimestamp(),
    });

    inputEl.value = "";
  });

  /* ---------- floating chat ---------- */
  floatToggle?.addEventListener("click", () => floatPanel.classList.toggle("hidden"));
  floatClose?.addEventListener("click", () => floatPanel.classList.add("hidden"));

  if (floatForm && floatList) {
    const q = query(
      collection(db, MESSAGES_COL),
      where("room", "==", "general"),
      orderBy("ts", "asc")
    );

    unsubscribeFloat = onSnapshot(q, (snap) => {
      const rows = [];
      snap.forEach((d) => rows.push(d.data()));
      renderMessages(floatList, rows.slice(-30), false);
    });

    floatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser) return;

      const text = floatInput.value.trim();
      if (!text) return;

      await addDoc(collection(db, MESSAGES_COL), {
        room: "general",
        text,
        userId: currentUser.id,
        name: currentUser.name,
        role: currentUser.role,
        ts: serverTimestamp(),
      });

      floatInput.value = "";
    });
  }

  /* ---------- initial state ---------- */
  setInputEnabled(false);
});
