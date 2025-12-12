// messages.js — TeleSyriana Firestore Chat
// ✅ NO limit() (نعمل lazy render من الكاش)
// ✅ Main Messages: ما بيفتح General تلقائي — بيكون Start chatting
// ✅ Floating Chat: general فقط
// ✅ DM (Direct chat): بين الموظفين (dm_1001_1002)
// ✅ AI Room: coming soon (بدون Firestore)
// ✅ ما منتحكم بإظهار/إخفاء زر 💬 هون (هذا شغل app.js فقط)

import { db, fs } from "./firebase.js";

const { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } = fs;

const USER_KEY = "telesyrianaUser";
const MESSAGES_COL = "globalMessages";

// ====== Lazy render (بديل limit) ======
const PAGE_SIZE = 50;
const MAX_RENDER = 600;

// ====== Rooms ======
const ROOM_META = {
  general: {
    name: "General chat",
    desc: "All agents & supervisors • Be respectful • No customer data.",
    showRole: true,
  },
  supervisors: {
    name: "Supervisors",
    desc: "Supervisor-only space for internal notes and coordination.",
    showRole: true,
  },
  ai_chat: {
    name: "ChatGPT 5",
    desc: "AI assistant (coming soon).",
    showRole: false,
  },
};

// ====== State ======
let currentUser = null;

// main room state
let activeRoomId = null;          // مثال: "general" أو "dm_1001_1002"
let activeRoomKind = "none";      // "none" | "group" | "dm" | "ai"
let activeShowRole = true;

// firestore unsub
let unsubscribeMain = null;
let unsubscribeFloat = null;

// main cache (ASC: القديم -> الجديد)
let roomCache = [];
let renderedCount = 0;

// لمنع تكرار bind scroll على نفس list
let scrollBoundEl = null;

// ====== Helpers ======
function getUserFromStorage() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw);
    if (u?.id && u?.name && u?.role) return u;
  } catch {}
  return null;
}

function refreshCurrentUser() {
  currentUser = getUserFromStorage();
}

function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function roomIdForDm(idA, idB) {
  const a = String(idA);
  const b = String(idB);
  const [min, max] = a < b ? [a, b] : [b, a];
  return `dm_${min}_${max}`;
}

function isMessagesPageVisible() {
  const page = document.getElementById("page-messages");
  if (!page) return false;
  return !page.classList.contains("hidden");
}

function closeFloatingPanel() {
  const panel = document.getElementById("float-chat-panel");
  if (panel) panel.classList.add("hidden");
}

function ensureTopLoader(listEl) {
  let loader = listEl.querySelector("#chat-top-loader");
  if (!loader) {
    loader = document.createElement("div");
    loader.id = "chat-top-loader";
    loader.style.display = "none";
    loader.style.padding = "8px";
    loader.style.textAlign = "center";
    loader.style.fontSize = "12px";
    loader.style.color = "#777";
    loader.textContent = "Loading older messages…";
    listEl.prepend(loader);
  }
  return loader;
}

function createMessageNode(m, showRole) {
  const wrapper = document.createElement("div");
  wrapper.className = "chat-message";
  if (currentUser && m.userId === currentUser.id) wrapper.classList.add("me");

  const meta = document.createElement("div");
  meta.className = "chat-message-meta";
  meta.textContent = showRole
    ? `${m.name} (${m.role}) • ${formatTime(m.ts)}`
    : `${m.name} • ${formatTime(m.ts)}`;

  const text = document.createElement("div");
  text.className = "chat-message-text";
  text.textContent = m.text || "";

  wrapper.appendChild(meta);
  wrapper.appendChild(text);
  return wrapper;
}

function renderFresh(listEl, msgs, showRole) {
  const loader = ensureTopLoader(listEl);

  // امسح كلشي ما عدا اللودر
  Array.from(listEl.children).forEach((ch) => {
    if (ch !== loader) ch.remove();
  });

  const frag = document.createDocumentFragment();
  msgs.forEach((m) => frag.appendChild(createMessageNode(m, showRole)));
  listEl.appendChild(frag);

  listEl.scrollTop = listEl.scrollHeight;
}

function renderChunkToTop(listEl, items, showRole) {
  const loader = ensureTopLoader(listEl);

  const prevScrollHeight = listEl.scrollHeight;
  const prevScrollTop = listEl.scrollTop;

  const frag = document.createDocumentFragment();
  items.forEach((m) => frag.appendChild(createMessageNode(m, showRole)));

  // حط الرسائل بعد اللودر مباشرة
  const afterLoader = loader.nextSibling;
  if (afterLoader) listEl.insertBefore(frag, afterLoader);
  else listEl.appendChild(frag);

  const newScrollHeight = listEl.scrollHeight;
  listEl.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
}

function attachScrollLoader(listEl) {
  if (!listEl) return;
  if (scrollBoundEl === listEl) return;
  scrollBoundEl = listEl;

  const loader = ensureTopLoader(listEl);

  listEl.addEventListener("scroll", () => {
    if (listEl.scrollTop > 40) return;

    const total = roomCache.length;
    const alreadyRenderedStartIndex = Math.max(0, total - renderedCount);

    if (alreadyRenderedStartIndex <= 0) return;
    if (renderedCount >= MAX_RENDER) return;

    loader.style.display = "block";

    const addCount = Math.min(PAGE_SIZE, alreadyRenderedStartIndex);
    const newStart = alreadyRenderedStartIndex - addCount;
    const chunk = roomCache.slice(newStart, alreadyRenderedStartIndex);

    renderedCount += chunk.length;
    renderChunkToTop(listEl, chunk, activeShowRole);

    setTimeout(() => (loader.style.display = "none"), 150);
  });
}

function setHeader(roomNameEl, roomDescEl, title, desc) {
  if (roomNameEl) roomNameEl.textContent = title;
  if (roomDescEl) roomDescEl.textContent = desc;
}

function setStartChattingUI(listEl, roomNameEl, roomDescEl, inputEl) {
  // ما في room مختار
  activeRoomId = null;
  activeRoomKind = "none";
  activeShowRole = true;

  unsubscribeMain?.();
  unsubscribeMain = null;

  roomCache = [];
  renderedCount = 0;
  scrollBoundEl = null;

  if (listEl) {
    listEl.innerHTML = `
      <div style="padding:14px 10px; color:#777; font-size:13px;">
        <strong>Start chatting</strong><br/>
        اختر Room (General / Supervisors) أو افتح Direct chat من القائمة.
      </div>
    `;
  }

  setHeader(roomNameEl, roomDescEl, "Start chatting", "Choose a room or a direct chat.");
  if (inputEl) {
    inputEl.value = "";
    inputEl.disabled = true;
    inputEl.placeholder = "Choose a room first…";
  }
}

function setActiveRoomButton(roomButtons, roomId) {
  roomButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.room === roomId));
}

// ====== Firestore subscribe (Main) ======
function subscribeMainToRoom(roomId, listEl) {
  if (!listEl) return;

  unsubscribeMain?.();

  // ✅ متوافق مع index الموجود عادة: room + ts DESC
  const qRoom = query(
    collection(db, MESSAGES_COL),
    where("room", "==", roomId),
    orderBy("ts", "desc")
  );

  unsubscribeMain = onSnapshot(
    qRoom,
    (snapshot) => {
      refreshCurrentUser();

      const all = [];
      snapshot.forEach((d) => all.push({ id: d.id, ...d.data() }));

      // snapshot حاليا DESC (الجديد -> القديم)
      all.reverse(); // نخليه ASC (القديم -> الجديد)
      roomCache = all;

      renderedCount = Math.min(PAGE_SIZE, roomCache.length);
      const startIndex = Math.max(0, roomCache.length - renderedCount);
      const initial = roomCache.slice(startIndex);

      renderFresh(listEl, initial, activeShowRole);
      attachScrollLoader(listEl);
    },
    (err) => {
      console.error("Main snapshot error:", err);
      alert("Firestore error: " + err.message);
    }
  );
}

// ====== Firestore subscribe (Floating - general only) ======
function subscribeFloatToGeneral(floatList) {
  if (!floatList) return;

  unsubscribeFloat?.();

  const qGeneral = query(
    collection(db, MESSAGES_COL),
    where("room", "==", "general"),
    orderBy("ts", "desc")
  );

  unsubscribeFloat = onSnapshot(
    qGeneral,
    (snapshot) => {
      refreshCurrentUser();

      const all = [];
      snapshot.forEach((d) => all.push({ id: d.id, ...d.data() }));
      all.reverse();

      const last = all.slice(Math.max(0, all.length - 30));

      floatList.innerHTML = "";
      const frag = document.createDocumentFragment();
      last.forEach((m) => frag.appendChild(createMessageNode(m, false)));
      floatList.appendChild(frag);
      floatList.scrollTop = floatList.scrollHeight;

      // ✅ أمان: إذا المستخدم فات على messages page، سكّر اللوحة فوراً (حتى لو انفتحت بالغلط)
      if (isMessagesPageVisible()) closeFloatingPanel();
    },
    (err) => console.error("Float snapshot error:", err)
  );
}

// ====== Room opening ======
function openGroupRoom(roomId, listEl, roomNameEl, roomDescEl, inputEl, roomButtons) {
  const meta = ROOM_META[roomId] || { name: roomId, desc: "Internal chat room.", showRole: true };

  activeRoomId = roomId;
  activeRoomKind = "group";
  activeShowRole = !!meta.showRole;

  setHeader(roomNameEl, roomDescEl, meta.name, meta.desc);
  setActiveRoomButton(roomButtons, roomId);

  if (inputEl) {
    inputEl.disabled = false;
    inputEl.placeholder = "Type a message…";
  }

  // reset loader binding (مهم عند تغيير الغرفة)
  scrollBoundEl = null;
  renderedCount = 0;
  roomCache = [];

  subscribeMainToRoom(roomId, listEl);
}

function openDmRoom(otherUserId, otherUserName, listEl, roomNameEl, roomDescEl, inputEl, roomButtons) {
  if (!currentUser) return;

  activeRoomId = roomIdForDm(currentUser.id, otherUserId);
  activeRoomKind = "dm";
  activeShowRole = false;

  // الغرف العامة شيل active عنها
  setActiveRoomButton(roomButtons, "__none__");

  setHeader(
    roomNameEl,
    roomDescEl,
    `Direct chat • ${otherUserName}`,
    `Private chat between ${currentUser.name} and ${otherUserName}`
  );

  if (inputEl) {
    inputEl.disabled = false;
    inputEl.placeholder = `Message ${otherUserName}…`;
  }

  scrollBoundEl = null;
  renderedCount = 0;
  roomCache = [];

  subscribeMainToRoom(activeRoomId, listEl);
}

function openAiRoom(listEl, roomNameEl, roomDescEl, inputEl, roomButtons) {
  activeRoomId = "ai_chat";
  activeRoomKind = "ai";
  activeShowRole = false;

  // شيل active عن الغرف العامة
  setActiveRoomButton(roomButtons, "__none__");

  setHeader(roomNameEl, roomDescEl, ROOM_META.ai_chat.name, ROOM_META.ai_chat.desc);

  unsubscribeMain?.();
  unsubscribeMain = null;

  if (inputEl) {
    inputEl.value = "";
    inputEl.disabled = true;
    inputEl.placeholder = "AI assistant coming soon…";
  }

  if (listEl) {
    listEl.innerHTML = `
      <div style="padding:14px 10px; color:#777; font-size:13px;">
        <strong>Coming soon…</strong><br/>
        ChatGPT room will be enabled in a future update.
      </div>
    `;
  }
}

// ====== Sending ======
async function sendMessage(text) {
  refreshCurrentUser();
  if (!currentUser) {
    alert("Please login first.");
    return;
  }

  if (!activeRoomId || activeRoomKind === "none") {
    alert("Choose a room first.");
    return;
  }

  if (activeRoomKind === "ai") {
    alert("ChatGPT room is coming soon.");
    return;
  }

  await addDoc(collection(db, MESSAGES_COL), {
    room: activeRoomId,
    text,
    userId: currentUser.id,
    name: currentUser.name,
    role: currentUser.role,
    ts: serverTimestamp(),
  });
}

// ====== Init ======
document.addEventListener("DOMContentLoaded", () => {
  // main elements
  const listEl = document.getElementById("chat-message-list");
  const roomNameEl = document.getElementById("chat-room-name");
  const roomDescEl = document.getElementById("chat-room-desc");
  const roomButtons = document.querySelectorAll(".chat-room");
  const formEl = document.getElementById("chat-form");
  const inputEl = document.getElementById("chat-input");

  // floating elements (ids لازم تكون فريدة بالصفحة!)
  const floatToggle = document.getElementById("float-chat-toggle");
  const floatPanel = document.getElementById("float-chat-panel");
  const floatClose = document.getElementById("float-chat-close");
  const floatList = document.getElementById("float-chat-messages");
  const floatForm = document.getElementById("float-chat-form");
  const floatInput = document.getElementById("float-chat-input");

  refreshCurrentUser();

  // اخفاء supervisors عن agent
  const supBtn = document.querySelector('.chat-room[data-room="supervisors"]');
  if (supBtn && (!currentUser || currentUser.role !== "supervisor")) supBtn.classList.add("hidden");

  // scroll styles
  if (listEl) {
    listEl.style.overflowY = "auto";
    listEl.style.maxHeight = "60vh";
  }
  if (floatList) {
    floatList.style.overflowY = "auto";
    floatList.style.maxHeight = "220px";
  }

  // ✅ Main chat starts empty (no default room)
  if (listEl) setStartChattingUI(listEl, roomNameEl, roomDescEl, inputEl);

  // group room buttons
  roomButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const roomId = btn.dataset.room;
      if (!roomId) return;

      // group rooms فقط من هالأزرار
      openGroupRoom(roomId, listEl, roomNameEl, roomDescEl, inputEl, roomButtons);
    });
  });

  // ✅ Direct profiles (DM)
  // لازم تحط data-userid + data-name على كل .chat-profile يلي بدك يفتح DM
  // مثال: <div class="chat-profile" data-userid="1002" data-name="Agent 02">
  document.querySelectorAll(".chat-profile[data-userid]").forEach((el) => {
    el.addEventListener("click", () => {
      refreshCurrentUser();
      if (!currentUser) return alert("Please login first.");

      const otherId = el.getAttribute("data-userid");
      const otherName = el.getAttribute("data-name") || "User";

      // ما تفتح DM مع نفسك
      if (String(otherId) === String(currentUser.id)) return;

      // إذا هذا AI
      if (otherId === "ai") {
        openAiRoom(listEl, roomNameEl, roomDescEl, inputEl, roomButtons);
        return;
      }

      openDmRoom(otherId, otherName, listEl, roomNameEl, roomDescEl, inputEl, roomButtons);
    });
  });

  // sending main
  formEl?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = (inputEl?.value || "").trim();
    if (!text) return;

    try {
      await sendMessage(text);
      inputEl.value = "";
    } catch (err) {
      console.error("Error sending message:", err);
      alert("Error sending message: " + err.message);
    }
  });

  // floating open/close (بس app.js بيقرر إذا الزر ظاهر أو مخفي)
  floatToggle?.addEventListener("click", () => {
    // ✅ إذا نحن ضمن صفحة messages، ما تفتح floating أصلاً
    if (isMessagesPageVisible()) {
      closeFloatingPanel();
      return;
    }
    floatPanel?.classList.toggle("hidden");
  });

  floatClose?.addEventListener("click", () => floatPanel?.classList.add("hidden"));

  // floating send (general فقط)
  floatForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = (floatInput?.value || "").trim();
    if (!text) return;

    refreshCurrentUser();
    if (!currentUser) return alert("Please login first.");

    try {
      await addDoc(collection(db, MESSAGES_COL), {
        room: "general",
        text,
        userId: currentUser.id,
        name: currentUser.name,
        role: currentUser.role,
        ts: serverTimestamp(),
      });
      floatInput.value = "";
    } catch (err) {
      console.error("Error sending message (float):", err);
      alert("Error sending message: " + err.message);
    }
  });

  // floating subscription دائماً (حتى لو الزر hidden)
  subscribeFloatToGeneral(floatList);

  // ✅ إذا عملت login/logout بدون refresh
  window.addEventListener("telesyriana:user-changed", () => {
    refreshCurrentUser();

    // supervisors button
    const supBtn2 = document.querySelector('.chat-room[data-room="supervisors"]');
    if (supBtn2 && (!currentUser || currentUser.role !== "supervisor")) supBtn2.classList.add("hidden");
    if (supBtn2 && currentUser && currentUser.role === "supervisor") supBtn2.classList.remove("hidden");

    // رجّع main chat لحالة Start chatting
    if (listEl) setStartChattingUI(listEl, roomNameEl, roomDescEl, inputEl);

    // سكّر floating panel احتياط
    closeFloatingPanel();
  });
});
