// messages.js – TeleSyriana chat UI (FINAL WORKING VERSION)

import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const USER_KEY = "telesyrianaUser";
const MESSAGES_COL = "globalMessages";

let currentUser = null;
let currentRoom = "general";
let unsubscribeMain = null;
let unsubscribeFloat = null;

/* ------------------ helpers ------------------ */

function loadUserFromStorage() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return;
    const u = JSON.parse(raw);
    if (u?.id && u?.name && u?.role) currentUser = u;
  } catch {}
}

function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ------------------ init ------------------ */

document.addEventListener("DOMContentLoaded", () => {
  const page = document.getElementById("page-messages");
  if (!page) return;

  const listEl = document.getElementById("chat-message-list");
  const formEl = document.getElementById("chat-form");
  const inputEl = document.getElementById("chat-input");

  const floatToggle = document.getElementById("float-chat-toggle");
  const floatPanel = document.getElementById("float-chat-panel");
  const floatClose = document.getElementById("float-chat-close");
  const floatList = document.getElementById("float-chat-messages");
  const floatForm = document.getElementById("float-chat-form");
  const floatInput = document.getElementById("float-chat-input");

  loadUserFromStorage();

  /* -------- send message (main) -------- */
  formEl?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return alert("Login first");
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

  /* -------- send message (floating) -------- */
  floatForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return alert("Login first");
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

  /* -------- floating toggle -------- */
  floatToggle?.addEventListener("click", () =>
    floatPanel.classList.toggle("hidden")
  );
  floatClose?.addEventListener("click", () =>
    floatPanel.classList.add("hidden")
  );

  subscribeMain(listEl);
  subscribeFloating(floatList);
});

/* ------------------ firestore ------------------ */

function subscribeMain(listEl) {
  unsubscribeMain?.();

  const q = query(
    collection(db, MESSAGES_COL),
    where("room", "==", currentRoom),
    orderBy("ts", "asc"),
    limit(200)
  );

  unsubscribeMain = onSnapshot(q, (snap) => {
    listEl.innerHTML = "";
    snap.forEach((d) => renderMessage(listEl, d.data()));
    listEl.scrollTop = listEl.scrollHeight;
  });
}

function subscribeFloating(listEl) {
  unsubscribeFloat?.();

  const q = query(
    collection(db, MESSAGES_COL),
    where("room", "==", "general"),
    orderBy("ts", "asc"),
    limit(50)
  );

  unsubscribeFloat = onSnapshot(q, (snap) => {
    listEl.innerHTML = "";
    snap.forEach((d) => renderMessage(listEl, d.data()));
    listEl.scrollTop = listEl.scrollHeight;
  });
}

/* ------------------ render ------------------ */

function renderMessage(container, m) {
  const wrap = document.createElement("div");
  wrap.className = "chat-message";
  if (currentUser && m.userId === currentUser.id) wrap.classList.add("me");

  const meta = document.createElement("div");
  meta.className = "chat-message-meta";
  meta.textContent = `${m.name} (${m.role}) • ${formatTime(m.ts)}`;

  const text = document.createElement("div");
  text.className = "chat-message-text";
  text.textContent = m.text;

  wrap.append(meta, text);
  container.appendChild(wrap);
}

