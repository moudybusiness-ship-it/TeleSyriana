// groups.js (DEMO localStorage) — visible only to creator + selected members
// Requires messages.js listener: telesyriana:open-group

const GROUPS_KEY = "telesyrianaGroupsDemo";
const USER_KEY = "telesyrianaUser"; // same as messages.js

function getCurrentUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadGroups() {
  try {
    return JSON.parse(localStorage.getItem(GROUPS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveGroups(groups) {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

function uid() {
  return "grp_" + Math.random().toString(16).slice(2) + "_" + Date.now();
}

function normalizeId(x) {
  return String(x ?? "").trim();
}

function groupVisibleToUser(group, userId) {
  const uid = normalizeId(userId);
  if (!uid) return false;
  const createdBy = normalizeId(group.createdBy);
  const members = Array.isArray(group.members) ? group.members.map(normalizeId) : [];
  return createdBy === uid || members.includes(uid);
}

function renderGroups() {
  const elGroupsList = document.getElementById("groups-list");
  if (!elGroupsList) return;

  const me = getCurrentUser();
  const myId = normalizeId(me?.id);

  // ✅ clear first (prevents duplicates)
  elGroupsList.innerHTML = "";

  if (!myId) {
    elGroupsList.innerHTML = `<div class="ms-empty">Please login to see groups</div>`;
    return;
  }

  const groupsAll = loadGroups();
  const groups = groupsAll.filter((g) => groupVisibleToUser(g, myId));

  if (!groups.length) {
    elGroupsList.innerHTML = `<div class="ms-empty">No groups yet</div>`;
    return;
  }

  const frag = document.createDocumentFragment();

  groups.forEach((g) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chat-room chat-group"; // reuse same style
    btn.dataset.groupId = g.id;

    const avatarLetter = (g.name || "G").trim().slice(0, 1).toUpperCase();
    const membersCount = Array.isArray(g.members) ? g.members.length : 0;

    btn.innerHTML = `
      <div class="chat-row">
        <div class="chat-avatar role-room">${avatarLetter}</div>
        <div class="chat-row-text">
          <div class="chat-room-title">${g.name || "Group"}</div>
          <div class="chat-room-sub">${membersCount} members</div>
        </div>
      </div>
    `;

    // ✅ Open group: fire event for messages.js
    btn.addEventListener("click", () => {
      window.dispatchEvent(
        new CustomEvent("telesyriana:open-group", {
          detail: {
            roomId: g.id,
            title: g.name,
            desc: g.rules ? `Rules: ${g.rules}` : "Group chat",
          },
        })
      );
    });

    frag.appendChild(btn);
  });

  elGroupsList.appendChild(frag);
}

function createGroupFromForm() {
  const me = getCurrentUser();
  const myId = normalizeId(me?.id);
  if (!myId) throw new Error("Please login first");

  const name = (document.getElementById("group-name")?.value || "").trim();
  const rules = (document.getElementById("group-rules")?.value || "").trim();

  // members: checkboxes name="group-members"
  const members = Array.from(
    document.querySelectorAll('input[name="group-members"]:checked')
  ).map((cb) => normalizeId(cb.value)).filter(Boolean);

  if (!name) throw new Error("Group name required");

  // ✅ Always include creator in members (so creator sees group even لو نسي يحدد نفسه)
  if (!members.includes(myId)) members.unshift(myId);

  const groups = loadGroups();

  const newGroup = {
    id: uid(),
    name,
    rules,
    members,
    createdBy: myId,
    createdByName: me?.name || "",
    createdAt: Date.now(),
    // photo: demo optional (store file name only or add base64 later)
  };

  groups.unshift(newGroup); // newest on top
  saveGroups(groups);
}

function hookCreateForm() {
  const form = document.getElementById("group-create-form");
  const btnCreate = document.getElementById("group-create-btn");

  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    if (btnCreate) btnCreate.disabled = true; // prevent double create

    try {
      createGroupFromForm();

      renderGroups();

      // close modal (if exists)
      document.getElementById("group-modal")?.classList.add("hidden");
      form.reset();
    } catch (err) {
      alert(err?.message || "Create failed");
    } finally {
      if (btnCreate) btnCreate.disabled = false;
    }
  });
}

// ✅ init safely (so it works even if script is in <head>)
document.addEventListener("DOMContentLoaded", () => {
  hookCreateForm();
  renderGroups();
});

// Optional: reset demo
window.resetGroupsDemo = function () {
  localStorage.removeItem(GROUPS_KEY);
  renderGroups();
};

// Optional: if login changes without refresh
window.addEventListener("telesyriana:user-changed", renderGroups);

