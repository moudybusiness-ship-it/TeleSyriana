// messages.js – TeleSyriana chat UI with Firestore

import { db, fs } from "./firebase.js";
import { limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} = fs;

const USER_KEY = "telesyrianaUser";
const MESSAGES_COL = "globalMessages";

let currentUser = null;
let unsubscribeMain = null;

function loadUserFromStorage() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return;
    const u = JSON.parse(raw);
    if (u?.id && u?.name && u?.role) currentUser = u;
  } catch {}
}

document.addEventListener("DOMContentLoaded", () => {
  loadUserFromStorage();

  const listEl = document.getElementById("chat-message-list");
  const formEl = document.getElementById("chat-form");
  const inputEl = document.getElementById("chat-input");

  if (!listEl || !formEl || !inputEl) return;

  // ✅ اشتراك: DESC (ليطابق الـ index الموجود) وبعدين نقلب بالعرض
  subscribeToRoom("general", listEl);

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return alert("Please login first.");

    const text = inputEl.value.trim();
    if (!text) return;

    try {
      await addDoc(collection(db, MESSAGES_COL), {
        room: "general",
        text,
        userId: currentUser.id,
        name: currentUser.name,
        role: currentUser.role,
        ts: serverTimestamp(),
      });
      inputEl.value = "";
    } catch (err) {
      console.error(err);
      alert("Send error: " + err.message);
    }
  });
});

function subscribeToRoom(room, listEl) {
  if (unsubscribeMain) unsubscribeMain();

  const q = query(
    collection(db, MESSAGES_COL),
    where("room", "==", room),
    orderBy("ts", "desc"),   // ✅ IMPORTANT
    limit(100)
  );

  unsubscribeMain = onSnapshot(
    q,
    (snap) => {
      const msgs = [];
      snap.forEach((d) => msgs.push({ id: d.id, ...d.data() }));

      // ✅ نقلبهم ليصير الأقدم فوق والأحدث تحت
      msgs.reverse();

      renderMessages(listEl, msgs);
    },
    (err) => {
      console.error("Snapshot error:", err);
      alert("Firestore error: " + err.message);
    }
  );
}

function renderMessages(listEl, msgs) {
  listEl.innerHTML = "";

  msgs.forEach((m) => {
    const wrapper = document.createElement("div");
    wrapper.className = "chat-message";
    if (currentUser && m.userId === currentUser.id) wrapper.classList.add("me");

    const meta = document.createElement("div");
    meta.className = "chat-message-meta";
    meta.textContent = `${m.name} (${m.role}) • ${formatTime(m.ts)}`;

    const text = document.createElement("div");
    text.className = "chat-message-text";
    text.textContent = m.text || "";

    wrapper.appendChild(meta);
    wrapper.appendChild(text);
    listEl.appendChild(wrapper);
  });

  // ينزل لآخر شي
  listEl.scrollTop = listEl.scrollHeight;
}

function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}


