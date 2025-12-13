/* =========================
   TeleSyriana – App.js
   - Login / Logout
   - Navigation (Home/Tasks/Messages/Settings)
   - Status selector (basic)
   - Dashboard widgets (clock/calendar safe rendering)
   - Tasks mini-kanban (optional if elements exist)
   - Theme toggle (optional)
========================= */

(function () {
  "use strict";

  /* -------------------------
     Small helpers
  ------------------------- */
  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => Array.from(root.querySelectorAll(q));
  const byId = (id) => document.getElementById(id);

  function safeText(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  function show(el) {
    if (!el) return;
    el.classList.remove("hidden");
  }

  function hide(el) {
    if (!el) return;
    el.classList.add("hidden");
  }

  function setActiveNav(page) {
    $$(".nav-link[data-page]").forEach((b) => b.classList.remove("active"));
    const btn = $(`.nav-link[data-page="${page}"]`);
    if (btn) btn.classList.add("active");
  }

  function setPage(page) {
    // pages may be: page-home / page-tasks / page-messages / page-settings
    const pages = ["home", "tasks", "messages", "settings"];
    pages.forEach((p) => hide(byId(`page-${p}`)));
    show(byId(`page-${page}`));
    setActiveNav(page);
  }

  /* -------------------------
     Fake users (you can replace later with real backend)
  ------------------------- */
  const USERS = [
    { username: "agent01", password: "1234", name: "Agent 01", role: "AGENT", ccms: "1001" },
    { username: "agent02", password: "1234", name: "Agent 02", role: "AGENT", ccms: "1002" },
    { username: "dema", password: "1234", name: "Supervisor Dema", role: "SUPERVISOR", ccms: "2001" },
  ];

  const state = {
    isAuthed: false,
    user: null,
    status: "in_operation", // in_operation | break | meeting | handling | unavailable
    breakLimitMin: 45,
    breakUsedMin: 7,
    operationMin: 0,
    meetingMin: 0,
    handlingMin: 0,
    timer: null,
  };

  /* -------------------------
     DOM refs (optional)
  ------------------------- */
  const loginScreen = byId("login-screen");
  const dashboardScreen = byId("dashboard-screen");

  const mainNav = byId("main-nav");
  const logoutBtn = byId("logout-btn");

  // Login elements (support many ids)
  const loginForm =
    byId("login-form") ||
    $("#login-screen form") ||
    null;

  const loginUser =
    byId("login-username") ||
    byId("username") ||
    $("#login-screen input[type='text']") ||
    $("#login-screen input[name='username']");

  const loginPass =
    byId("login-password") ||
    byId("password") ||
    $("#login-screen input[type='password']") ||
    $("#login-screen input[name='password']");

  const loginAlert = byId("login-alert") || $("#login-screen .alert");

  // Header label (optional)
  const headerUser = byId("header-user") || byId("agent-name") || null;

  // Status elements (optional)
  const statusSelect = byId("status-select");
  const statusValue = $(".status-value") || byId("status-value");

  // Dashboard fields (optional)
  const breakUsedEl = byId("break-used");
  const breakRemainEl = byId("break-remaining");
  const opEl = byId("op-time");
  const meetingEl = byId("meeting-time");
  const handlingEl = byId("handling-time");

  // Widgets (optional)
  const widgetClock = byId("widget-clock");
  const widgetToday = byId("widget-today");
  const widgetDate = byId("widget-date");
  const widgetCalendar = byId("mini-cal"); // if exists

  // Settings (optional)
  const themeToggle = byId("theme-toggle") || byId("toggle-theme-male");

  /* -------------------------
     Auth UI
  ------------------------- */
  function setAuth(isAuthed, user = null) {
    state.isAuthed = isAuthed;
    state.user = user;

    if (isAuthed) {
      hide(loginScreen);
      show(dashboardScreen);
      if (mainNav) mainNav.classList.remove("hidden");

      // Update header name if exists
      if (headerUser) safeText(headerUser, user?.name || "Agent");
      // Default page
      setPage("home");
      startTicker();
      renderAll();
    } else {
      show(loginScreen);
      hide(dashboardScreen);
      if (mainNav) mainNav.classList.add("hidden");
      stopTicker();
    }
  }

  function attemptLogin(username, password) {
    const u = (username || "").trim().toLowerCase();
    const p = (password || "").trim();

    const found = USERS.find((x) => x.username === u && x.password === p);
    if (!found) {
      if (loginAlert) {
        loginAlert.classList.remove("hidden");
        loginAlert.textContent = "Invalid username or password.";
      }
      return;
    }
    if (loginAlert) loginAlert.classList.add("hidden");
    setAuth(true, found);
  }

  function logout() {
    setAuth(false, null);
    if (loginUser) loginUser.value = "";
    if (loginPass) loginPass.value = "";
  }

  /* -------------------------
     Navigation wiring
  ------------------------- */
  function wireNav() {
    $$(".nav-link[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const page = btn.dataset.page;
        setPage(page);
      });
    });

    if (logoutBtn) logoutBtn.addEventListener("click", logout);
  }

  /* -------------------------
     Status logic
  ------------------------- */
  function statusLabel(key) {
    const map = {
      in_operation: "In Operation",
      break: "In Break",
      meeting: "In Meeting",
      handling: "Handling",
      unavailable: "Unavailable",
    };
    return map[key] || key;
  }

  function renderStatus() {
    if (statusValue) {
      statusValue.className = "status-value";
      statusValue.classList.add(`status-${state.status}`);
      statusValue.textContent = statusLabel(state.status);
    }
    if (statusSelect) {
      statusSelect.value = state.status;
    }
  }

  function wireStatus() {
    if (!statusSelect) return;
    statusSelect.addEventListener("change", () => {
      state.status = statusSelect.value;
      renderStatus();
    });
  }

  /* -------------------------
     Dashboard numbers
  ------------------------- */
  function mmToText(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h <= 0) return `${m} min`;
    return `${h} hrs ${m} min`;
  }

  function renderDashboardNumbers() {
    const remain = Math.max(0, state.breakLimitMin - state.breakUsedMin);
    safeText(breakUsedEl, `${state.breakUsedMin} / ${state.breakLimitMin} min`);
    safeText(breakRemainEl, `${remain} min`);

    safeText(opEl, mmToText(state.operationMin));
    safeText(meetingEl, mmToText(state.meetingMin));
    safeText(handlingEl, mmToText(state.handlingMin));
  }

  /* -------------------------
     Widgets (Clock / Today / Date / Mini Calendar)
     Fixes the "ugly list" issue by rendering plain text (no raw inputs)
  ------------------------- */
  function renderWidgets() {
    const now = new Date();

    if (widgetClock) {
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      widgetClock.textContent = `${hh}:${mm}`;
    }

    if (widgetToday) {
      widgetToday.textContent = now.toLocaleDateString(undefined, { weekday: "long" });
    }

    if (widgetDate) {
      widgetDate.textContent = now.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }

    // Optional mini calendar if your HTML has it
    if (widgetCalendar) {
      // If you already have a custom calendar elsewhere, ignore this.
      // Here we keep it minimal & safe.
      // Expected structure:
      // #mini-cal .mini-cal-weekdays
      // #mini-cal .mini-cal-grid
      const weekdays = $(".mini-cal-weekdays", widgetCalendar);
      const grid = $(".mini-cal-grid", widgetCalendar);
      if (!weekdays || !grid) return;

      weekdays.innerHTML = "";
      ["M", "T", "W", "T", "F", "S", "S"].forEach((d) => {
        const el = document.createElement("div");
        el.textContent = d;
        weekdays.appendChild(el);
      });

      grid.innerHTML = "";
      const y = now.getFullYear();
      const m = now.getMonth();

      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);

      // Monday-based index:
      let start = first.getDay(); // 0=Sun
      start = (start + 6) % 7; // convert to 0=Mon

      // previous month days to fill
      const prevLast = new Date(y, m, 0).getDate();
      for (let i = start - 1; i >= 0; i--) {
        const d = document.createElement("div");
        d.className = "mini-day muted";
        d.textContent = String(prevLast - i);
        grid.appendChild(d);
      }

      // current month days
      for (let day = 1; day <= last.getDate(); day++) {
        const d = document.createElement("div");
        d.className = "mini-day";
        d.textContent = String(day);
        if (day === now.getDate()) d.classList.add("today");
        grid.appendChild(d);
      }

      // next month filler to complete grid nice
      const total = grid.children.length;
      const need = (7 - (total % 7)) % 7;
      for (let i = 1; i <= need; i++) {
        const d = document.createElement("div");
        d.className = "mini-day muted";
        d.textContent = String(i);
        grid.appendChild(d);
      }
    }
  }

  /* -------------------------
     Tasks (optional mini kanban)
     Works only if your HTML has:
     #task-title-input, #task-priority-select, #task-add-btn
     columns: [data-kanban="todo|doing|done"] with .kanban-list inside
  ------------------------- */
  function wireTasks() {
    const titleInput = byId("task-title-input");
    const prioSelect = byId("task-priority-select");
    const addBtn = byId("task-add-btn");

    const todoList = $('[data-kanban="todo"] .kanban-list');
    const doingList = $('[data-kanban="doing"] .kanban-list');
    const doneList = $('[data-kanban="done"] .kanban-list');

    if (!titleInput || !addBtn || !todoList) return;

    function makeCard(title, prio) {
      const card = document.createElement("div");
      card.className = "task-card";
      card.draggable = true;
      card.innerHTML = `
        <div class="task-row">
          <div class="task-title">${escapeHtml(title)}</div>
          <div class="task-actions">
            <button class="task-btn" data-act="del">✕</button>
          </div>
        </div>
        <div class="task-meta">${prio ? `Priority: ${prio}` : ""}</div>
      `;

      card.addEventListener("dragstart", () => card.classList.add("dragging"));
      card.addEventListener("dragend", () => card.classList.remove("dragging"));

      card.querySelector('[data-act="del"]').addEventListener("click", () => {
        card.remove();
      });

      return card;
    }

    addBtn.addEventListener("click", () => {
      const title = (titleInput.value || "").trim();
      if (!title) return;
      const prio = prioSelect ? prioSelect.value : "";
      todoList.appendChild(makeCard(title, prio));
      titleInput.value = "";
    });

    [todoList, doingList, doneList].filter(Boolean).forEach((list) => {
      list.addEventListener("dragover", (e) => {
        e.preventDefault();
        list.classList.add("drag-over");
        const dragging = $(".task-card.dragging");
        if (dragging) list.appendChild(dragging);
      });
      list.addEventListener("dragleave", () => list.classList.remove("drag-over"));
      list.addEventListener("drop", () => list.classList.remove("drag-over"));
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* -------------------------
     Theme (optional)
     If you have a checkbox toggle, it will set body[data-theme="male"]
  ------------------------- */
  function wireTheme() {
    if (!themeToggle) return;

    themeToggle.addEventListener("change", () => {
      document.body.setAttribute("data-theme", themeToggle.checked ? "male" : "female");
    });
  }

  /* -------------------------
     Timer tick (basic simulation)
  ------------------------- */
  function tick() {
    // update counters (very simple)
    // You can replace with real tracking logic later
    if (state.status === "break") state.breakUsedMin += 1;
    if (state.status === "in_operation") state.operationMin += 1;
    if (state.status === "meeting") state.meetingMin += 1;
    if (state.status === "handling") state.handlingMin += 1;

    renderAll();
  }

  function startTicker() {
    stopTicker();
    // every 60 seconds
    state.timer = setInterval(tick, 60_000);
  }

  function stopTicker() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  function renderAll() {
    renderStatus();
    renderDashboardNumbers();
    renderWidgets();
  }

  /* -------------------------
     Boot
  ------------------------- */
  function boot() {
    wireNav();
    wireStatus();
    wireTasks();
    wireTheme();

    // login handling
    if (loginForm) {
      loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        attemptLogin(loginUser?.value, loginPass?.value);
      });
    }

    // auto start logged out
    setAuth(false, null);

    // optional: quick dev auto-login if you want:
    // setAuth(true, USERS[0]);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
