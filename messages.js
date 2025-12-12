// messages.js – TeleSyriana chat UI with Firestore (FINAL STABLE)

import { db, fs } from "./firebase.js";

const {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  documentId, // ✅ مهم لحل مشكلة الـ index
} = fs;

const USER_KEY = "telesyrianaUser";
const MESSAGES_COL = "globalMessages";

let currentUser = null;
let currentRoom = "general";

let unsubscribeMain = null;
let unsubscribeFloat = null;

/* ===================== USER ===================== */

function loadUserFromStorage() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return;
    const u = JSON.parse(raw);
    if (u?.id && u?.name && u?.role) currentUser = u;
  } catch (e) {
    console.error("Error loading user", e);
  }
}

/* ===================== INIT ===================== */

document.addEventListener("DOMContentLoaded", () => {
  const pageMessages = document.getElementById("page-messages");
  if (!pageMessages) return;

  const roomButtons = document.querySelectorAll(".chat-room");
  const roomNameEl = document.getElementById("chat-room-name");
  const roomDescEl = document.getElementById("chat-room-desc");
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

  // إخفاء supervisors عن الـ agents
  const supBtn = document.querySelector('.chat-room[data-room="supervisors"]');
  if (supBtn && (!currentUser || currentUser.role !== "supervisor")) {
    supBtn.classList.add("hidden");
  }

  // إظهار زر الشات العائم
  if (floatToggle && currentUser) {
    floatToggle.classList.remove("hidden");
  }

  const ROOM_META = {
    general: {
      name: "General chat",
      desc: "All agents & supervisors • No customer data",
    },
    supervisors: {
      name: "Supervisors",
      desc: "Supervisor-only internal chat",
    },
  };

  // scroll safety
  if (listEl) {
    listEl.style.overflowY = "auto";
    listEl.style.maxHeight = "60vh";
  }
  if (floatList) {
    floatList.style.overflowY = "auto";
    floatList.style.maxHeight = "220px";
  }

  /* ========== ROOM SWITCH ========== */
  roomButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentRoom = btn.dataset.room;
      applyRoomMeta(currentRoom, ROOM_META, roomNameEl, roomDescEl);
      setActiveRoomButton(currentRoom, roomButtons);
      subscribeMainToRoom(currentRoom, listEl);
    });
  });

  /* ========== SEND MESSAGE (MAIN) ========== */
  formEl?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text || !currentUser) return;

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

  /* ========== FLOAT CHAT ========== */
  floatToggle?.addEventListener("click", () =>
    floatPanel.classList.toggle("hidden")
  );

  floatClose?.addEventListener("click", () =>
    floatPanel.classList.add("hidden")
  );

  floatForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = floatInput.value.trim();
    if (!text || !currentUser) return;

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

  /* ========== INIT SUBSCRIPTIONS ========== */
  applyRoomMeta(currentRoom, ROOM_META, roomNameEl, roomDescEl);
  setActiveRoomButton(currentRoom, roomButtons);

  subscribeMainToRoom(currentRoom, listEl);
  subscribeFloatToGeneral(floatList);
});

/* ===================== FIRESTORE ===================== */

// 🔥 الحل النهائي لمشكلة الـ index
function subscribeMainToRoom(room, listEl) {
  unsubscribeMain?.();

  const qRoom = query(
    collection(db, MESSAGES_COL),
    where("room", "==", room),
    orderBy("ts", "desc"),
    orderBy(documentId(), "desc")
  );

  unsubscribeMain = onSnapshot(qRoom, (snapshot) => {
    const msgs = [];
    snapshot.forEach((d) => msgs.push({ id: d.id, ...d.data() }));
    msgs.reverse(); // القديم فوق
    renderMainMessages(listEl, msgs);
  });
}

function subscribeFloatToGeneral(floatList) {
  unsubscribeFloat?.();

  const qGeneral = query(
    collection(db, MESSAGES_COL),
    where("room", "==", "general"),
    orderBy("ts", "desc"),
    orderBy(documentId(), "desc")
  );

  unsubscribeFloat = onSnapshot(qGeneral, (snapshot) => {
    const msgs = [];
    snapshot.forEach((d) => msgs.push({ id: d.id, ...d.data() }));
    msgs.reverse();
    renderFloatingMessages(floatList, msgs);
  });
}

/* ===================== UI ===================== */

function applyRoomMeta(room, ROOM_META, nameEl, descEl) {
  const meta = ROOM_META[room] || {};
  nameEl.textContent = meta.name || room;
  descEl.textContent = meta.desc || "";
}

function setActiveRoomButton(room, buttons) {
  buttons.forEach((b) =>
    b.classList.toggle("active", b.dataset.room === room)
  );
}

/* ===================== RENDER ===================== */

function renderMainMessages(listEl, msgs) {
  listEl.innerHTML = "";
  msgs.forEach((m) => listEl.appendChild(buildMsg(m)));
  listEl.scrollTop = listEl.scrollHeight;
}

function renderFloatingMessages(listEl, msgs) {
  listEl.innerHTML = "";
  msgs.forEach((m) => listEl.appendChild(buildMsg(m)));
  listEl.scrollTop = listEl.scrollHeight;
}

function buildMsg(m) {
  const wrap = document.createElement("div");
  wrap.className = "chat-message";
  if (currentUser && m.userId === currentUser.id) wrap.classList.add("me");

  const meta = document.createElement("div");
  meta.className = "chat-message-meta";
  meta.textContent = `${m.name} • ${formatTime(m.ts)}`;

  const text = document.createElement("div");
  text.className = "chat-message-text";
  text.textContent = m.text || "";

  wrap.append(meta, text);
  return wrap;
}

function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
