// groups.js (DEMO) — localStorage groups (only creator + members can see)
// Requires HTML:
// - #create-group-btn
// - #groups-list + #groups-empty
// - existing users list in DOM: buttons.chat-dm[data-dm] (agents/sups IDs)
// Dispatches: window.dispatchEvent(new CustomEvent("telesyriana:rooms-updated"))

const USER_KEY = "telesyrianaUser";

const ROOMS_KEY = "demo:rooms";          // array of room objects
const MSGS_KEY  = "demo:messages";       // { [roomId]: [messages...] }

function safeParse(v, fallback){
  try { return JSON.parse(v); } catch { return fallback; }
}

function getUser(){
  return safeParse(localStorage.getItem(USER_KEY), null);
}

function loadRooms(){
  const rooms = safeParse(localStorage.getItem(ROOMS_KEY), []);
  return Array.isArray(rooms) ? rooms : [];
}

function saveRooms(rooms){
  localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms || []));
}

function loadMsgs(){
  return safeParse(localStorage.getItem(MSGS_KEY), {});
}

function saveMsgs(map){
  localStorage.setItem(MSGS_KEY, JSON.stringify(map || {}));
}

function uid(){
  return "g_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function canSeeRoom(room, user){
  if (!room || !user) return false;
  if (room.type !== "group") return true;

  const members = room.members || [];
  return room.createdBy === user.id || members.includes(user.id);
}

function getAllSelectableUsers(){
  // take from DM list in HTML (so your demo USERS stay in one place)
  const btns = Array.from(document.querySelectorAll(".chat-dm[data-dm]"));
  return btns.map(b => {
    const id = String(b.dataset.dm || "");
    const nameEl = b.querySelector(".chat-room-title");
    const name = nameEl ? nameEl.textContent.trim() : `User ${id}`;
    return { id, name };
  });
}

// ---------- UI: render groups list ----------
function renderGroupsList(){
  const user = getUser();
  const list = document.getElementById("groups-list");
  const empty = document.getElementById("groups-empty");
  if (!list) return;

  const rooms = loadRooms().filter(r => r.type === "group" && canSeeRoom(r, user));

  // clear (keep empty element if exists)
  list.innerHTML = "";
  if (!rooms.length){
    if (empty){
      empty.style.display = "block";
      list.appendChild(empty);
    }
    return;
  }

  if (empty) empty.style.display = "none";

  rooms
    .sort((a,b) => (b.createdAt||0) - (a.createdAt||0))
    .forEach(room => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chat-room";
      btn.dataset.room = room.id;

      btn.innerHTML = `
        <div class="chat-row">
          <div class="chat-avatar role-room">G</div>
          <div class="chat-row-text">
            <div class="chat-room-title">${escapeHtml(room.title || "Group")}</div>
            <div class="chat-room-sub">${escapeHtml(room.desc || "Group chat")}</div>
          </div>
        </div>
      `;

      // clicking group should behave like room click in messages.js
      btn.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("telesyriana:open-room", {
          detail: { roomId: room.id, title: room.title, desc: room.desc, type: "group" }
        }));
      });

      list.appendChild(btn);
    });
}

function escapeHtml(s){
  return String(s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ---------- Modal ----------
function buildModal(){
  let modal = document.getElementById("group-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "group-modal";
  modal.className = "modal hidden";
  modal.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="modal-card">
      <div class="modal-head">
        <div class="modal-title">Create Group</div>
        <button class="modal-x" type="button" data-close>×</button>
      </div>

      <form id="group-form" class="modal-body">
        <label>
          Group name
          <input id="group-name" type="text" placeholder="e.g. Team A" required />
        </label>

        <label>
          Rules (optional)
          <textarea id="group-rules" rows="3" placeholder="Write group rules…"></textarea>
        </label>

        <label>
          Photo (optional)
          <input id="group-photo" type="file" accept="image/*" />
          <small class="hint">Demo: photo saved locally only</small>
        </label>

        <div style="margin-top:10px; font-weight:900; font-size:12px; color:#666;">
          Select members
        </div>
        <div id="group-members" style="margin-top:8px; display:grid; gap:8px;"></div>

        <div class="modal-actions">
          <button type="button" class="btn-secondary" data-close>Cancel</button>
          <button type="submit" class="btn-primary" style="width:auto;">Create</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  // close handlers
  modal.querySelectorAll("[data-close]").forEach(el=>{
    el.addEventListener("click", ()=> modal.classList.add("hidden"));
  });

  return modal;
}

function openModal(){
  const modal = buildModal();
  const membersWrap = modal.querySelector("#group-members");
  const users = getAllSelectableUsers();

  membersWrap.innerHTML = users.map(u => `
    <label style="display:flex; gap:10px; align-items:center; font-size:13px; margin:0;">
      <input type="checkbox" value="${u.id}" />
      <span>${escapeHtml(u.name)} <span style="opacity:.6;">(CCMS ${u.id})</span></span>
    </label>
  `).join("");

  modal.classList.remove("hidden");
}

// ---------- create group ----------
async function fileToBase64(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function handleCreateGroup(e){
  e.preventDefault();
  const user = getUser();
  if (!user || user.role !== "supervisor") return;

  const modal = document.getElementById("group-modal");
  const name = (modal.querySelector("#group-name").value || "").trim();
  const rules = (modal.querySelector("#group-rules").value || "").trim();
  const photoFile = modal.querySelector("#group-photo").files?.[0] || null;

  const checked = Array.from(modal.querySelectorAll("#group-members input[type='checkbox']:checked"))
    .map(cb => String(cb.value));

  if (!name) return alert("Group name is required.");
  if (!checked.length) return alert("Select at least 1 member.");

  const roomId = uid();

  const photo = photoFile ? await fileToBase64(photoFile) : "";

  const room = {
    id: roomId,
    type: "group",
    title: name,
    desc: `${checked.length} members`,
    rules,
    photo,
    createdBy: user.id,
    members: checked,
    createdAt: Date.now()
  };

  const rooms = loadRooms();
  rooms.push(room);
  saveRooms(rooms);

  // init messages bucket
  const msgs = loadMsgs();
  msgs[roomId] = msgs[roomId] || [];
  saveMsgs(msgs);

  modal.classList.add("hidden");

  // tell messages.js to refresh rooms/groups
  window.dispatchEvent(new CustomEvent("telesyriana:rooms-updated"));
  renderGroupsList();
}

// ---------- init ----------
document.addEventListener("DOMContentLoaded", () => {
  const user = getUser();
  const btn = document.getElementById("create-group-btn");

  if (btn){
    btn.style.display = (user?.role === "supervisor") ? "" : "none";
    btn.addEventListener("click", openModal);
  }

  const modal = buildModal();
  modal.querySelector("#group-form").addEventListener("submit", handleCreateGroup);

  renderGroupsList();
});

// on login/logout refresh
window.addEventListener("telesyriana:user-changed", () => {
  const user = getUser();
  const btn = document.getElementById("create-group-btn");
  if (btn) btn.style.display = (user?.role === "supervisor") ? "" : "none";
  renderGroupsList();
});

// allow external refresh
window.addEventListener("telesyriana:rooms-updated", () => {
  renderGroupsList();
});
