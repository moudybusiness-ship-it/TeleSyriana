// groups.js (DEMO localStorage)

const GROUPS_KEY = "telesyrianaGroupsDemo";
const elGroupsList = document.getElementById("groups-list"); // لازم يكون عندك div/ul للغروبات
const btnCreate = document.getElementById("group-create-btn"); // زر Create/Invite داخل المودال
const form = document.getElementById("group-create-form");     // الفورم تبع المودال

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

function renderGroups() {
  if (!elGroupsList) return;

  const groups = loadGroups();

  // ✅ IMPORTANT: امسح القديم قبل ما تعيد الرسم (هي سبب التكرار بالصورة)
  elGroupsList.innerHTML = "";

  if (!groups.length) {
    elGroupsList.innerHTML = `<div class="ms-empty">No groups yet</div>`;
    return;
  }

  const frag = document.createDocumentFragment();

  groups.forEach((g) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chat-room chat-group";   // خليه نفس ستايل باقي الأزرار
    btn.dataset.groupId = g.id;               // مهم للفتح

    btn.innerHTML = `
      <div class="chat-row">
        <div class="chat-avatar role-room">${(g.name || "G")[0].toUpperCase()}</div>
        <div class="chat-row-text">
          <div class="chat-room-title">${g.name || "Group"}</div>
          <div class="chat-room-sub">${(g.members?.length || 0)} members</div>
        </div>
      </div>
    `;

    // ✅ فتح المجموعة: نبعث Event لـ messages.js
    btn.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("telesyriana:open-group", {
        detail: {
          roomId: g.id,
          title: g.name,
          desc: g.rules ? `Rules: ${g.rules}` : "Group chat"
        }
      }));
    });

    frag.appendChild(btn);
  });

  elGroupsList.appendChild(frag);
}

// ✅ Create group (DEMO)
form?.addEventListener("submit", (e) => {
  e.preventDefault();

  if (btnCreate) btnCreate.disabled = true; // ✅ يمنع double create

  try {
    const name = (document.getElementById("group-name")?.value || "").trim();
    const rules = (document.getElementById("group-rules")?.value || "").trim();

    // members: checkboxes name="group-members"
    const members = Array.from(document.querySelectorAll('input[name="group-members"]:checked'))
      .map(cb => cb.value);

    if (!name) throw new Error("Group name required");

    const groups = loadGroups();

    const newGroup = {
      id: uid(),
      name,
      rules,
      members,
      createdAt: Date.now()
    };

    groups.unshift(newGroup); // newest on top
    saveGroups(groups);

    renderGroups();

    // اغلاق المودال اذا عندك
    document.getElementById("group-modal")?.classList.add("hidden");
    form.reset();
  } catch (err) {
    alert(err.message || "Create failed");
  } finally {
    if (btnCreate) btnCreate.disabled = false;
  }
});

// أول ما تفتح الصفحة
document.addEventListener("DOMContentLoaded", renderGroups);

// إذا بدك زر “Reset demo” (اختياري):
window.resetGroupsDemo = function () {
  localStorage.removeItem(GROUPS_KEY);
  renderGroups();
};

