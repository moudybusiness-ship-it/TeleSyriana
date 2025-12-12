// messages.js – TeleSyriana chat UI (Firestore realtime, no composite index)
// - Rooms: general + supervisors
// - Direct profiles لسا ديكور، ما في private chat حالياً
// - Hide supervisors room for non-supervisors
// - Uses currentUser from localStorage
// - Realtime sync + floating mini chat

import { db, fs } from "./firebase.js";

const {
  collection,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} = fs;

const USER_KEY = "telesyrianaUser";
const CHAT_COL = "chatMessages";

let currentUser = null;
let currentRoom = "general";
let unsubscribeChat = null;

// نخزّن آخر رسائل معمول لها render بالذاكرة بس
let lastMessagesForRoom = {
  general: [],
  supervisors: [],
};

document.addEventListener("DOMContentLoaded", () => {
  const pageMessages = document.getElementById("page-messages");
  if (!pageMessages) return;

  // عناصر صفحة المسجات
  const roomButtons = document.querySelectorAll(".chat-room");
  const roomNameEl = document.getElementById("chat-room-name");
  const roomDescEl = document.getElementById("chat-room-desc");
  const listEl = document.getElementById("chat-message-list");
  const formEl = document.getElementById("chat-form");
  const inputEl = document.getElementById("chat-input");

  // عناصر الشات العائم
  const floatToggle = document.getElementById("float-chat-toggle");
  const floatPanel = document.getElementById("float-chat-panel");
  const floatClose = document.getElementById("float-chat-close");
  const floatList = document.getElementById("float-chat-messages");
  const floatForm = document.getElementById("float-chat-form");
  const floatInput = document.getElementById("float-chat-input");

  loadUserFromStorage();

  // إخفاء غرفة المشرفين عن الـ agents
  const supBtn = document.querySelector('.chat-room[data-room="supervisors"]');
  if (supBtn && (!currentUser || currentUser.role !== "supervisor")) {
    supBtn.classList.add("hidden");
  }

  // تعريف وصف الغرف
  const ROOM_META = {
    general: {
      name: "General chat",
      desc: "All agents & supervisors • Be respectful • No customer data.",
    },
    supervisors: {
      name: "Supervisors",
      desc: "Supervisor-only space for internal notes and coordination.",
    },
  };

  // لو في مستخدم محفوظ من قبل
  if (currentUser) {
    subscribeToRoom(currentRoom, {
      ROOM_META,
      roomButtons,
      roomNameEl,
      roomDescEl,
      listEl,
      floatList,
    });

    // أظهر زر البالونة
    if (floatToggle) floatToggle.classList.remove("hidden");
  } else {
    if (formEl) formEl.classList.add("hidden");
    if (floatToggle) floatToggle.classList.add("hidden");
  }

  // تبديل الغرف
  roomButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!ensureUser()) return;
      const room = btn.dataset.room;
      switchRoom(room, {
        ROOM_META,
        roomButtons,
        roomNameEl,
        roomDescEl,
        listEl,
        floatList,
      });
    });
  });

  // إرسال من الشات الرئيسي
  if (formEl && inputEl) {
    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!ensureUser()) return;

      const text = inputEl.value.trim();
      if (!text) return;

      await sendMessage(currentRoom, text);
      inputEl.value = "";
    });
  }

  // شات عائم – فتح/إغلاق
  if (floatToggle && floatPanel) {
    floatToggle.addEventListener("click", () => {
      if (!ensureUser()) return;

      floatPanel.classList.toggle("hidden");

      if (!floatPanel.classList.contains("hidden")) {
        // نتأكد مشتركين بالـ general
        subscribeToRoom("general", {
          ROOM_META,
          roomButtons,
          roomNameEl,
          roomDescEl,
          listEl,
          floatList,
        });
        renderFloatingMessages(floatList, lastMessagesForRoom.general);
      }
    });
  }

  if (floatClose && floatPanel) {
    floatClose.addEventListener("click", () => {
      floatPanel.classList.add("hidden");
    });
  }

  // إرسال من الشات العائم (دائماً general)
  if (floatForm && floatInput) {
    floatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!ensureUser()) return;

      const text = floatInput.value.trim();
      if (!text) return;

      await sendMessage("general", text);
      floatInput.value = "";
    });
  }

  // أول meta
  applyRoomMeta(currentRoom, ROOM_META, roomNameEl, roomDescEl);
  setActiveRoomButton(currentRoom, roomButtons);
});

// ----------------- Helpers -----------------

function loadUserFromStorage() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return;
    const u = JSON.parse(raw);
    if (u && u.id && u.name && u.role) {
      currentUser = u;
    }
  } catch (e) {
    console.error("Error loading user from localStorage", e);
  }
}

function ensureUser() {
  if (!currentUser) loadUserFromStorage();
  if (!currentUser) {
    alert("Please login first to use chat.");
    return false;
  }
  return true;
}

function switchRoom(room, ctx) {
  if (!room || currentRoom === room) return;
  currentRoom = room;

  applyRoomMeta(room, ctx.ROOM_META, ctx.roomNameEl, ctx.roomDescEl);
  setActiveRoomButton(room, ctx.roomButtons);
  subscribeToRoom(room, ctx);
}

// اشتراك Firestore بالغرفة
async function subscribeToRoom(
  room,
  { ROOM_META, roomButtons, roomNameEl, roomDescEl, listEl, floatList }
) {
  if (!ensureUser()) return;

  if (unsubscribeChat) {
    unsubscribeChat();
    unsubscribeChat = null;
  }

  const colRef = collection(db, CHAT_COL);
  // بدون orderBy لحتى ما يطلب index مركّب
  const qRoom = query(colRef, where("room", "==", room));

  await ensureSystemWelcome(room);

  unsubscribeChat = onSnapshot(qRoom, (snapshot) => {
    const msgs = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      msgs.push({
        ...data,
        id: docSnap.id,
      });
    });

    // نرتّب حسب ts بالـ JS
    msgs.sort((a, b) => {
      const ta = tsToMillis(a.ts);
      const tb = tsToMillis(b.ts);
      return ta - tb;
    });

    lastMessagesForRoom[room] = msgs;

    if (room === currentRoom) {
      renderMainMessages(listEl, msgs);
    }

    if (room === "general" && floatList) {
      renderFloatingMessages(floatList, msgs);
    }
  });

  applyRoomMeta(room, ROOM_META, roomNameEl, roomDescEl);
  setActiveRoomButton(room, roomButtons);
}

async function ensureSystemWelcome(room) {
  const id = `system_welcome_${room}`;
  const ref = doc(collection(db, CHAT_COL), id);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  let text = "";
  if (room === "general") {
    text = "Welcome to the TeleSyriana general chat 👋";
  } else if (room === "supervisors") {
    text = "Supervisor room – internal coordination only.";
  } else {
    text = "Welcome to this chat room.";
  }

  await setDoc(ref, {
    room,
    userId: "system",
    name: "System",
    role: "system",
    text,
    ts: serverTimestamp(),
  });
}

function applyRoomMeta(room, ROOM_META, roomNameEl, roomDescEl) {
  const meta = ROOM_META[room] || {};
  if (roomNameEl) roomNameEl.textContent = meta.name || room;
  if (roomDescEl)
    roomDescEl.textContent = meta.desc || "Internal chat room.";
}

function setActiveRoomButton(room, roomButtons) {
  roomButtons.forEach((btn) => {
    if (btn.dataset.room === room) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

async function sendMessage(room, text) {
  if (!currentUser) return;

  const colRef = collection(db, CHAT_COL);
  const ref = doc(colRef); // auto ID

  await setDoc(ref, {
    room,
    userId: currentUser.id,
    name: currentUser.name,
    role: currentUser.role,
    text,
    ts: serverTimestamp(),
  });
}

// ----------------- Rendering -----------------

function renderMainMessages(listEl, msgs) {
  if (!listEl) return;
  listEl.innerHTML = "";

  msgs.forEach((m) => {
    const wrapper = document.createElement("div");
    wrapper.className = "chat-message";
    if (currentUser && m.userId === currentUser.id) {
      wrapper.classList.add("me");
    }

    const meta = document.createElement("div");
    meta.className = "chat-message-meta";
    const timeStr = formatTime(m.ts);
    meta.textContent = `${m.name} (${m.role}) • ${timeStr}`;

    const text = document.createElement("div");
    text.className = "chat-message-text";
    text.textContent = m.text;

    wrapper.appendChild(meta);
    wrapper.appendChild(text);
    listEl.appendChild(wrapper);
  });

  listEl.scrollTop = listEl.scrollHeight;
}

function renderFloatingMessages(floatList, msgs) {
  if (!floatList) return;
  floatList.innerHTML = "";

  msgs.forEach((m) => {
    const wrapper = document.createElement("div");
    wrapper.className = "chat-message";
    if (currentUser && m.userId === currentUser.id) {
      wrapper.classList.add("me");
    }

    const meta = document.createElement("div");
    meta.className = "chat-message-meta";
    const timeStr = formatTime(m.ts);
    meta.textContent = `${m.name} • ${timeStr}`;

    const text = document.createElement("div");
    text.className = "chat-message-text";
    text.textContent = m.text;

    wrapper.appendChild(meta);
    wrapper.appendChild(text);
    floatList.appendChild(wrapper);
  });

  floatList.scrollTop = floatList.scrollHeight;
}

function tsToMillis(ts) {
  if (!ts) return 0;
  if (ts.toMillis && typeof ts.toMillis === "function") {
    return ts.toMillis();
  }
  if (ts.toDate && typeof ts.toDate === "function") {
    return ts.toDate().getTime();
  }
  if (ts instanceof Date) {
    return ts.getTime();
  }
  return new Date(ts).getTime();
}

function formatTime(ts) {
  const ms = tsToMillis(ts);
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
