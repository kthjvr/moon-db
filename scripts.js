// ─── Firebase SDK (loaded via CDN in index.html) ───────────────────────────
/* global firebase, FullCalendar */

// ─── Types (JSDoc) ─────────────────────────────────────────────────────────
/**
 * @typedef {'QA'|'Marketing'|'Finance'} Role
 * @typedef {'Backlog'|'In Progress'|'Blocked'|'Done'} Status
 * @typedef {'Low'|'Medium'|'High'} Priority
 *
 * @typedef {Object} Task
 * @property {number}   id
 * @property {string}   title
 * @property {Role}     role
 * @property {Status}   status
 * @property {Priority} priority
 * @property {string}   due
 * @property {boolean}  done
 * @property {boolean}  [recurring]  - if true, shows in the daily recurring panel every day
 */

// ─── Firebase Config ────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyC8q4jLNUkZVa31F5BP9FXVQxZiJQVoAX8",
  authDomain: "moon-db-42f38.firebaseapp.com",
  projectId: "moon-db-42f38",
  storageBucket: "moon-db-42f38.firebasestorage.app",
  messagingSenderId: "769692711280",
  appId: "1:769692711280:web:6d3584dd59ef851fe4f7b5",
  measurementId: "G-65E6SEG369",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Custom bar label plugin — draws values above each bar without external dependencies
const barLabelPlugin = {
  id: "barLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      meta.data.forEach((bar, index) => {
        const value = dataset.data[index];
        if (!value || value === 0) return;
        const label = i === 1 ? `${value}h` : String(value);
        ctx.save();
        const barHeight = bar.base - bar.y;
        const insideY = bar.y + barHeight / 2;
        const drawInside = barHeight >= 18;

        ctx.font = "600 11px 'DM Sans', sans-serif";
        ctx.fillStyle = drawInside
          ? i === 0
            ? "#802840"
            : "#402880"
          : i === 0
            ? "#A03060"
            : "#6040A0";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, bar.x, drawInside ? insideY : bar.y - 6);
        ctx.restore();
      });
    });
  },
};
// barLabelPlugin passed directly into chart instance (see renderAnalyticsChart)

// ─── Constants ─────────────────────────────────────────────────────────────
const POMO_DURATIONS = { focus: 25 * 60, break: 5 * 60 };
const CIRCUMFERENCE = 2 * Math.PI * 40;
const STATUSES = ["In Progress", "Backlog", "Blocked", "Done"];

// Generic placeholders so first-time users aren't confused
const DEFAULT_ROLES = ["Role 1", "Role 2", "Role 3"];
const DEFAULT_COLOR_ID = "rose";

const ROLE_COLORS = [
  {
    id: "rose",
    bg: "#FFE0EC",
    border: "#F4AACB",
    text: "#A03060",
    eventBg: "#FFD6E7",
    eventBorder: "#F8C8DC",
  },
  {
    id: "lavender",
    bg: "#EDE0FF",
    border: "#CDB8F5",
    text: "#6040A0",
    eventBg: "#E6D6FF",
    eventBorder: "#CDB8F5",
  },
  {
    id: "sky",
    bg: "#DCEEFF",
    border: "#A8CEFF",
    text: "#2060A0",
    eventBg: "#D0E8FF",
    eventBorder: "#A0C8F8",
  },
  {
    id: "mint",
    bg: "#D6F0E8",
    border: "#88D8B8",
    text: "#207060",
    eventBg: "#C8EAD8",
    eventBorder: "#80C8A8",
  },
  {
    id: "peach",
    bg: "#FFE8D0",
    border: "#FFBF88",
    text: "#A05020",
    eventBg: "#FFD8B8",
    eventBorder: "#F8AE78",
  },
  {
    id: "lemon",
    bg: "#FFFAD0",
    border: "#F0D860",
    text: "#806010",
    eventBg: "#FFF4A8",
    eventBorder: "#E8CC50",
  },
  {
    id: "lilac",
    bg: "#F0E0FF",
    border: "#D0A8F0",
    text: "#702090",
    eventBg: "#E8D0FF",
    eventBorder: "#C098E8",
  },
];

// Generic task placeholders
/** @type {Task[]} */
const SAMPLE_TASKS = [
  {
    id: 1,
    title: "Task Title 1",
    role: "Role 1",
    status: "In Progress",
    priority: "High",
    due: todayISO(),
    done: false,
    recurring: false,
  },
  {
    id: 2,
    title: "Task Title 2",
    role: "Role 1",
    status: "Backlog",
    priority: "Medium",
    due: offsetDate(2),
    done: false,
    recurring: false,
  },
  {
    id: 3,
    title: "Task Title 3",
    role: "Role 2",
    status: "In Progress",
    priority: "High",
    due: offsetDate(1),
    done: false,
    recurring: false,
  },
  {
    id: 4,
    title: "Task Title 4",
    role: "Role 2",
    status: "Blocked",
    priority: "Medium",
    due: offsetDate(3),
    done: false,
    recurring: false,
  },
  {
    id: 5,
    title: "Task Title 5",
    role: "Role 3",
    status: "In Progress",
    priority: "High",
    due: todayISO(),
    done: false,
    recurring: false,
  },
  {
    id: 6,
    title: "Task Title 6",
    role: "Role 3",
    status: "Backlog",
    priority: "Medium",
    due: offsetDate(5),
    done: false,
    recurring: false,
  },
];

// ─── State ──────────────────────────────────────────────────────────────────
/** @type {Task[]} */ let tasks = [];
let nextId = 200;
let activeTab = "overview";
/** @type {string[]} */ let roles = [...DEFAULT_ROLES];
/** @type {Record<string,string>} */ let roleColorMap = {};
let dateFilters = {};
let draggedTask = null;
let calendar = null;
/** @type {Object|null} */ let currentUser = null;
/** @type {Record<string,string>} */ let sortDirections = {};
/** @type {Chart|null} */ let analyticsChart = null;
let analyticsFilter = "today";
let calendarRoleFilter = "all"; // 'all'

let pomoMode = "focus";
let pomoRunning = false;
let pomoSeconds = POMO_DURATIONS.focus;
/** @type {number|null} */ let pomoInterval = null;
let tomatoCount = 0;
let tomatoDate = todayISO();
// Track daily pomo history so analytics can show past focus hours
/** @type {Record<string,number>} — date string → pomodoro count */
let pomoHistory = {};

let quickTitle = "";
let isEditingTaskTitle = false;

// ─── Helpers ────────────────────────────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function formatDate(iso) {
  if (!iso) return "";
  const t = todayISO();
  if (iso === t) return "Today";
  const diff = Math.round(
    (new Date(iso + "T00:00:00") - new Date(t + "T00:00:00")) / 86400000,
  );
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function isUrgent(t) {
  if (t.done) return false;
  if (!t.due) return t.priority === "High";
  return t.due <= todayISO();
}

function fmtSeconds(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function matchesDateFilter(t, filter) {
  if (filter === "all" || !t.due) return true;
  const today = new Date(todayISO()),
    due = new Date(t.due);
  if (filter === "today") return t.due === todayISO();
  if (filter === "week") {
    const e = new Date(today);
    e.setDate(today.getDate() + 7);
    return due >= today && due <= e;
  }
  if (filter === "month") {
    const e = new Date(today);
    e.setMonth(today.getMonth() + 1);
    return due >= today && due <= e;
  }
  return true;
}

// ─── Auth helpers ────────────────────────────────────────────────────────────
function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch((err) => {
    console.error("Sign-in error:", err);
    alert("Sign-in failed. Please try again.");
  });
}

function signOut() {
  if (!confirm("Sign out of Moon DB?")) return;
  auth.signOut();
}

function showLoginScreen() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}

function showAppScreen() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
}

function updateUserDisplay(user) {
  const nameEl = document.getElementById("user-name");
  const avatarEl = document.getElementById("user-avatar");
  const displayName = user.displayName || user.email || "User";
  if (nameEl) nameEl.textContent = displayName;
  if (avatarEl) {
    avatarEl.innerHTML = user.photoURL
      ? `<img src="${user.photoURL}" alt="avatar" style="width:28px;height:28px;border-radius:50%;object-fit:cover;" />`
      : `<span style="width:28px;height:28px;border-radius:50%;background:#F8C8DC;color:#802840;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;">${displayName[0].toUpperCase()}</span>`;
  }
}

function editDisplayName() {
  const newName = prompt(
    "Edit your display name:",
    currentUser.displayName || currentUser.email || "User",
  );
  if (newName === null || newName.trim() === "") return;
  currentUser
    .updateProfile({ displayName: newName.trim() })
    .then(() => {
      updateUserDisplay(currentUser);
      userDoc()
        .update({ displayName: newName.trim() })
        .catch(() => {});
    })
    .catch((err) => {
      console.error("Error updating display name:", err);
      alert("Failed to update display name.");
    });
}

// ─── Task title editing ──────────────────────────────────────────────────────
function startEditTaskTitle() {
  if (isEditingTaskTitle) return;
  isEditingTaskTitle = true;
  const titleEl = document.getElementById("modal-task-title");
  const inputEl = document.getElementById("modal-task-title-input");
  const buttonsEl = document.getElementById("modal-edit-buttons");
  if (titleEl && inputEl && buttonsEl) {
    inputEl.value = titleEl.textContent;
    titleEl.classList.add("hidden");
    inputEl.classList.remove("hidden");
    buttonsEl.classList.remove("hidden");
    inputEl.focus();
    inputEl.select();
  }
}

function saveTaskTitle() {
  const inputEl = document.getElementById("modal-task-title-input");
  const newTitle = inputEl.value.trim();
  if (!newTitle) {
    alert("Task title cannot be empty.");
    return;
  }
  const task = window.currentModalTask;
  if (task) {
    task.title = newTitle;
    saveData();
    const titleEl = document.getElementById("modal-task-title");
    titleEl.textContent = newTitle;
    titleEl.classList.remove("hidden");
    inputEl.classList.add("hidden");
    document.getElementById("modal-edit-buttons").classList.add("hidden");
    isEditingTaskTitle = false;
    render();
  }
}

function cancelEditTaskTitle() {
  document.getElementById("modal-task-title").classList.remove("hidden");
  document.getElementById("modal-task-title-input").classList.add("hidden");
  document.getElementById("modal-edit-buttons").classList.add("hidden");
  isEditingTaskTitle = false;
}

// ─── Color helpers ────────────────────────────────────────────────────────────
function getRoleColor(role) {
  const colorId = roleColorMap[role] || DEFAULT_COLOR_ID;
  return ROLE_COLORS.find((c) => c.id === colorId) || ROLE_COLORS[0];
}

// ─── Pill helpers ─────────────────────────────────────────────────────────────
function rolePill(r) {
  const c = getRoleColor(r);
  return `<span class="pill text-[11px] font-medium px-2 py-0.5 rounded-full" style="background:${c.bg};color:${c.text};border:1px solid ${c.border};">${r}</span>`;
}

function priPill(p) {
  const map = {
    High: "bg-red-100 text-red-500",
    Medium: "bg-amber-100 text-amber-600",
    Low: "bg-green-100 text-green-600",
  };
  return `<span class="pill text-[11px] font-medium px-2 py-0.5 rounded-full ${map[p] || ""}">${p}</span>`;
}

function statusPill(s) {
  const map = {
    "In Progress": "bg-blue-100 text-blue-500",
    Blocked: "bg-red-100 text-red-400",
    Done: "bg-gray-100 text-gray-400",
    Backlog: "bg-gray-50 text-gray-300",
  };
  return `<span class="pill text-[11px] font-medium px-2 py-0.5 rounded-full ${map[s] || ""}">${s}</span>`;
}

// ─── Firestore persistence ────────────────────────────────────────────────────
function userDoc() {
  return db.collection("users").doc(currentUser.uid);
}

async function loadFromFirestore() {
  if (!currentUser) return;
  showLoadingState(true);
  try {
    const doc = await userDoc().get();
    if (doc.exists) {
      const data = doc.data();
      tasks = data.tasks || [...SAMPLE_TASKS];
      nextId = data.nextId || 200;
      roles = data.roles || [...DEFAULT_ROLES];
      roleColorMap = data.roleColorMap || {};
      tomatoCount = data.tomatoDate === todayISO() ? data.tomatoCount || 0 : 0;
      tomatoDate = todayISO();
      // Load pomo history
      pomoHistory = data.pomoHistory || {};
      const noteEl = document.getElementById("notepad");
      if (noteEl) noteEl.value = data.note || "";
    } else {
      tasks = [...SAMPLE_TASKS];
      nextId = 200;
      roles = [...DEFAULT_ROLES];
      await saveToFirestore();
    }
  } catch (err) {
    console.error("Error loading from Firestore:", err);
  }

  roles.forEach((r, i) => {
    if (!roleColorMap[r])
      roleColorMap[r] = ROLE_COLORS[i % ROLE_COLORS.length].id;
  });
  dateFilters = { all: "all" };
  roles.forEach((r) => {
    dateFilters[r.toLowerCase().replace(/\s+/g, "_")] = "all";
  });

  // Reset recurring tasks that were completed on a previous day
  let recurringReset = false;
  tasks.forEach((t) => {
    if (t.recurring && t.done && t.doneDate && t.doneDate !== todayISO()) {
      t.done = false;
      t.status = "In Progress";
      t.doneDate = "";
      recurringReset = true;
    }
  });
  if (recurringReset) saveToFirestore();

  // Auto-move tasks due today from Backlog → In Progress
  let autoMoved = false;
  tasks.forEach((t) => {
    if (!t.done && t.due === todayISO() && t.status === "Backlog") {
      t.status = "In Progress";
      autoMoved = true;
    }
  });
  if (autoMoved) saveToFirestore();

  showLoadingState(false);
}

async function saveToFirestore() {
  if (!currentUser) return;
  const noteEl = document.getElementById("notepad");
  try {
    await userDoc().set({
      tasks,
      nextId,
      roles,
      roleColorMap,
      tomatoCount,
      tomatoDate,
      pomoHistory, // persist history
      note: noteEl ? noteEl.value : "",
      displayName: currentUser.displayName || "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("Error saving to Firestore:", err);
  }
}

function saveData() {
  saveToFirestore();
  if (activeTab === "overview") updateCalendarEvents();
}

async function saveNote() {
  if (!currentUser) return;
  const el = /** @type {HTMLTextAreaElement} */ (
    document.getElementById("notepad")
  );
  try {
    await userDoc().update({
      note: el.value,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (_) {
    await saveToFirestore();
  }
  const saved = document.getElementById("note-saved");
  if (saved) {
    saved.textContent = "✓ saved";
    setTimeout(() => {
      saved.textContent = "";
    }, 1500);
  }
}

function saveTomatoCount() {
  if (!currentUser) return;
  // Record this date's count in history every time it changes
  pomoHistory[tomatoDate] = tomatoCount;
  userDoc()
    .update({ tomatoCount, tomatoDate, pomoHistory })
    .catch(() => saveToFirestore());
}

function showLoadingState(loading) {
  const el = document.getElementById("loading-overlay");
  if (el) el.classList.toggle("hidden", !loading);
}

// ─── Render: Overview ─────────────────────────────────────────────────────────
function renderMetrics() {
  const active = tasks.filter((t) => !t.done);
  setText("m-total", String(active.length));
  setText(
    "m-inprogress",
    String(active.filter((t) => t.status === "In Progress").length),
  );
  setText(
    "m-blocked",
    String(active.filter((t) => t.status === "Blocked").length),
  );
}

// Today's priorities = High priority tasks only (not filtered by due date)
function renderToday() {
  const el = document.getElementById("today-list");
  if (!el) return;
  const top = tasks
    .filter((t) => !t.done && t.priority === "High")
    .sort((a, b) => {
      // Sort by due date ascending, tasks with no due date go last
      const aDate = a.due ? new Date(a.due) : new Date("9999-12-31");
      const bDate = b.due ? new Date(b.due) : new Date("9999-12-31");
      return aDate - bDate;
    })
    .slice(0, 5);
  el.innerHTML = top.length
    ? top.map((t) => taskRowHTML(t, false)).join("")
    : `<p class="text-sm text-pink-200 text-center py-4">No high priority tasks right now!</p>`;
}

// Urgent panel → daily recurring tasks
function renderUrgent() {
  const el = document.getElementById("urgent-list");
  if (!el) return;
  const recurring = tasks.filter((t) => t.recurring && !t.done);
  if (!recurring.length) {
    el.innerHTML = `<p class="text-xs text-pink-200 text-center py-2">No recurring tasks yet.<br><span style="font-size:0.65rem;color:#DDB0C0;">Add tasks and mark them as recurring!</span></p>`;
    return;
  }
  el.innerHTML = recurring
    .map(
      (t) => `
    <div class="flex items-start gap-2 p-2 rounded-xl bg-pink-50 border border-pink-100 mb-2 last:mb-0">
      <span style="font-size:1rem;flex-shrink:0;margin-top:1px;">🔁</span>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-medium text-pink-700 leading-snug">${t.title}</p>
        <p class="text-[10px] text-pink-400 mt-0.5">${t.role} · recurring daily</p>
      </div>
      <button onclick="toggleDone(${t.id})"
        class="flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition mt-0.5 ${t.done ? "bg-lavender-200 border-lavender-300" : "border-pink-200 hover:border-pink-400"}">
        ${t.done ? '<span class="w-1.5 h-1.5 rounded-full bg-lavender-500 block"></span>' : ""}
      </button>
    </div>`,
    )
    .join("");
}

function renderRoleSnapshot() {
  const el = document.getElementById("role-snapshot");
  if (!el) return;
  el.innerHTML = roles
    .map((r) => {
      const rt = tasks.filter((t) => t.role === r && !t.done);
      return `
      <div class="flex items-center justify-between py-2 border-b border-pink-50 last:border-none">
        <span class="text-sm font-medium text-gray-600 w-20">${r}</span>
        <div class="flex items-center gap-3 text-xs font-mono">
          <span class="text-gray-300">${rt.filter((t) => t.status === "Backlog").length}</span>
          <span class="text-blue-300">${rt.filter((t) => t.status === "In Progress").length}</span>
          <span class="text-red-300">${rt.filter((t) => t.status === "Blocked").length}</span>
        </div>
      </div>`;
    })
    .join("");
}

// ─── Render: Kanban ───────────────────────────────────────────────────────────
function renderKanban(role, elId, dateFilter) {
  const isMobile = window.innerWidth <= 768;
  const el = document.getElementById(elId);
  if (!el) return;
  let filtered = tasks.filter(
    (t) =>
      (role === null || t.role === role) && matchesDateFilter(t, dateFilter),
  );
  const tabKey =
    role === null ? "all" : role.toLowerCase().replace(/\s+/g, "_");
  const sortDir = sortDirections[tabKey] || "asc";
  filtered = filtered.sort((a, b) => {
    const aDate = a.due ? new Date(a.due) : new Date("9999-12-31");
    const bDate = b.due ? new Date(b.due) : new Date("9999-12-31");
    return sortDir === "asc" ? aDate - bDate : bDate - aDate;
  });
  let html = "";
  for (const status of STATUSES) {
    const statusTasks = filtered.filter((t) => t.status === status);
    html += `
      <div class="kanban-column">
        <div class="kanban-column-header">
          <div class="kanban-column-title">${status}</div>
          <div class="kanban-column-count">${statusTasks.length}</div>
        </div>
        <div class="kanban-drop-zone" data-status="${status}"
          ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)">
          ${statusTasks.length ? statusTasks.map((t) => taskCardHTML(t, role === null)).join("") : '<div class="kanban-empty">Drop tasks here</div>'}
        </div>
      </div>`;
  }
  // On mobile, prepend column switcher tabs
  if (isMobile) {
    const activeCol = el.dataset.mobileCol || 'In Progress';
    const tabsHtml = `
      <div class="kanban-mobile-tabs" style="display:flex;gap:0.5rem;margin-bottom:1rem;overflow-x:auto;padding-bottom:0.25rem;">
        ${STATUSES.map(s => `
          <button onclick="setMobileKanbanCol('${elId}','${s}')"
            style="flex-shrink:0;padding:0.4rem 1rem;border-radius:0.75rem;font-size:0.8rem;font-weight:600;cursor:pointer;border:2px solid ${activeCol===s?'#A888E0':'#FFD6E7'};background:${activeCol===s?'#E6D6FF':'white'};color:${activeCol===s?'#6040A0':'#999'};transition:all 0.2s;">
            ${s}
          </button>`).join('')}
      </div>`;
    el.innerHTML = tabsHtml + html;
    // Show only active column
    el.querySelectorAll('.kanban-column').forEach(col => {
      const title = col.querySelector('.kanban-column-title')?.textContent?.trim();
      col.classList.toggle('mobile-active', title === activeCol);
    });
  } else {
    el.innerHTML = html;
  }
}

function setMobileKanbanCol(elId, status) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.dataset.mobileCol = status;
  render();
}

function taskCardHTML(t, showRole) {
  const c = getRoleColor(t.role);
  // Show recurring badge on card
  const recurringBadge = t.recurring
    ? `<span style="font-size:10px;background:#FFF0F5;color:#C05070;border:1px solid #FFD6E7;border-radius:99px;padding:1px 6px;font-weight:500;">🔁 Daily</span>`
    : "";
  return `
    <div class="task-card" draggable="true" id="card-${t.id}" style="border-left:3px solid ${c.border};"
      ondragstart="handleDragStart(event,${t.id})" ondragend="handleDragEnd(event)">
      <div class="task-card-title">${t.title}</div>
      <div class="task-card-meta">
        ${showRole ? rolePill(t.role) : ""}
        ${statusPill(t.status)}${priPill(t.priority)}
        ${recurringBadge}
      </div>
      <div class="task-card-bottom">
        <input type="date" class="task-card-due" value="${t.due || ""}"
          style="padding:0.25rem 0.5rem;border:1px solid #FFD6E7;border-radius:0.375rem;font-size:0.75rem;cursor:pointer;"
          onchange="updateTaskDue(${t.id},this.value)" />
        <div style="display:flex;gap:0.25rem;align-items:center;">
          <button class="task-card-delete" onclick="toggleRecurring(${t.id})" title="${t.recurring ? "Remove recurring" : "Mark as recurring"}" style="opacity:0.6;font-size:0.85rem;">${t.recurring ? "🔁" : "↺"}</button>
          <button class="task-card-delete" onclick="duplicateTask(${t.id})" title="Duplicate" style="opacity:0.6;">📋</button>
          <button class="task-card-delete" onclick="deleteTask(${t.id})">×</button>
        </div>
      </div>
    </div>`;
}

function taskRowHTML(t, showDelete) {
  const overdue = t.due && t.due <= todayISO() && !t.done;
  return `
    <div class="flex items-start gap-3 py-2.5 border-b border-pink-50 last:border-none" id="tr-${t.id}">
      <button onclick="toggleDone(${t.id})"
        class="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition ${t.done ? "bg-lavender-200 border-lavender-300" : "border-pink-200 hover:border-pink-400"}">
        ${t.done ? '<span class="w-1.5 h-1.5 rounded-full bg-lavender-500 block"></span>' : ""}
      </button>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-gray-700 leading-snug ${t.done ? "line-through text-gray-300" : ""}" onclick="showTaskDetail(tasks.find(x => x.id === ${t.id}))" style="cursor:pointer;">${t.title}</p>
        <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
          ${rolePill(t.role)}${statusPill(t.status)}${priPill(t.priority)}
          ${t.recurring ? `<span style="font-size:10px;color:#C05070;">🔁</span>` : ""}
          ${t.due ? `<span class="text-[11px] font-mono ${overdue && !t.done ? "text-red-400 font-semibold" : "text-gray-300"}">${formatDate(t.due)}</span>` : ""}
        </div>
      </div>
      ${showDelete ? `<button class="text-pink-200 hover:text-pink-400 text-base w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 transition" onclick="deleteTask(${t.id})">×</button>` : ""}
    </div>`;
}

// ─── Render: Calendar Filter ─────────────────────────────────────────────────────────
function renderCalendarRoleFilter() {
  const el = document.getElementById("calendar-role-filter");
  if (!el) return;
  const options = ["all", ...roles];
  el.innerHTML = options
    .map((r) => {
      const isActive = calendarRoleFilter === r;
      const c = r === "all" ? null : getRoleColor(r);
      const activeBg = c ? c.bg : "#F8C8DC";
      const activeBorder = c ? c.border : "#F0A0C0";
      const activeText = c ? c.text : "#802840";
      return `<button
      onclick="setCalendarRoleFilter('${r}')"
      style="
        font-size:11px; font-weight:500; padding:3px 10px; border-radius:99px; cursor:pointer; transition:all 0.15s;
        background:${isActive ? activeBg : "white"};
        border:1.5px solid ${isActive ? activeBorder : "#FFD6E7"};
        color:${isActive ? activeText : "#C08090"};
      ">
      ${r === "all" ? "All" : r}
    </button>`;
    })
    .join("");
}

function setCalendarRoleFilter(role) {
  calendarRoleFilter = role;
  renderCalendarRoleFilter();
  updateCalendarEvents();
}

// ─── Drag and drop ────────────────────────────────────────────────────────────
function handleDragStart(e, taskId) {
  draggedTask = taskId;
  const card = document.getElementById(`card-${taskId}`);
  if (card) card.classList.add("dragging");
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}

function handleDragEnd() {
  document
    .querySelectorAll(".kanban-drop-zone")
    .forEach((z) => z.classList.remove("drag-over"));
  if (draggedTask) {
    const c = document.getElementById(`card-${draggedTask}`);
    if (c) c.classList.remove("dragging");
  }
}

function handleDragOver(e) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  if (e.currentTarget) e.currentTarget.classList.add("drag-over");
}

function handleDragLeave(e) {
  if (e.currentTarget && e.target === e.currentTarget)
    e.currentTarget.classList.remove("drag-over");
}

function handleDrop(e) {
  e.preventDefault();
  const zone = /** @type {HTMLElement} */ (e.currentTarget);
  zone.classList.remove("drag-over");
  if (!draggedTask) return;
  const task = tasks.find((t) => t.id === draggedTask);
  if (task) {
    task.status = zone.getAttribute("data-status");
    task.done = task.status === "Done";
    if (task.status !== "Done" && task.done) task.done = false;
  }
  saveData();
  render();
  draggedTask = null;
}

// ─── Actions ──────────────────────────────────────────────────────────────────
function toggleDone(id) {
  const t = tasks.find((x) => x.id === id);
  if (t) {
    t.done = !t.done;
    t.status = t.done ? "Done" : t.recurring ? "In Progress" : "Backlog";
    // Track the date it was completed so we can reset it tomorrow
    t.doneDate = t.done ? todayISO() : "";
  }
  saveData();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter((x) => x.id !== id);
  saveData();
  render();
}

function duplicateTask(id) {
  const orig = tasks.find((x) => x.id === id);
  if (!orig) return;
  tasks.unshift({
    id: nextId++,
    title: orig.title,
    role: orig.role,
    status: "Backlog",
    priority: orig.priority,
    due: orig.due,
    done: false,
    recurring: orig.recurring || false,
  });
  saveData();
  render();
}

function updateTaskDue(id, newDue) {
  const t = tasks.find((x) => x.id === id);
  if (t) {
    t.due = newDue;
    saveData();
    render();
  }
}

// Toggle recurring flag on a task
function toggleRecurring(id) {
  const t = tasks.find((x) => x.id === id);
  if (t) {
    t.recurring = !t.recurring;
    saveData();
    render();
  }
}

function quickAdd() {
  const input = /** @type {HTMLInputElement} */ (
    document.getElementById("quick-input")
  );
  quickTitle = input.value.trim();
  if (!quickTitle) return;
  updateRoleSelect();
  document.getElementById("quick-form").classList.remove("hidden");
  /** @type {HTMLInputElement} */ (document.getElementById("qf-due")).value =
    todayISO();
}

function updateRoleSelect() {
  const sel = document.getElementById("qf-role");
  if (sel) sel.innerHTML = roles.map((r) => `<option>${r}</option>`).join("");
}

function cancelQuick() {
  document.getElementById("quick-form").classList.add("hidden");
  /** @type {HTMLInputElement} */ (
    document.getElementById("quick-input")
  ).value = "";
  quickTitle = "";
}

function saveQuickTask() {
  const role = document.getElementById("qf-role").value;
  const priority = document.getElementById("qf-priority").value;
  const status = document.getElementById("qf-status").value;
  const due = /** @type {HTMLInputElement} */ (
    document.getElementById("qf-due")
  ).value;
  const recurring = /** @type {HTMLInputElement} */ (
    document.getElementById("qf-recurring")
  ).checked;
  tasks.unshift({
    id: nextId++,
    title: quickTitle,
    role,
    status,
    priority,
    due,
    done: false,
    recurring,
  });
  saveData();
  render();
  cancelQuick();
}

function setDateFilter(tab, filter) {
  dateFilters[tab] = filter;
  document.querySelectorAll(`#tab-${tab} .date-filter-badge`).forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-filter") === filter);
  });
  render();
}

function setSortDirection(tab, direction) {
  sortDirections[tab] = direction;
  const ascBtn = document.getElementById(`sort-${tab}-asc`);
  const descBtn = document.getElementById(`sort-${tab}-desc`);
  if (direction === "asc") {
    if (ascBtn) {
      ascBtn.style.background = "#E6D6FF";
      ascBtn.style.color = "#6040A0";
      ascBtn.style.borderColor = "#A888E0";
    }
    if (descBtn) {
      descBtn.style.background = "white";
      descBtn.style.color = "#999";
      descBtn.style.borderColor = "#FFD6E7";
    }
  } else {
    if (descBtn) {
      descBtn.style.background = "#E6D6FF";
      descBtn.style.color = "#6040A0";
      descBtn.style.borderColor = "#A888E0";
    }
    if (ascBtn) {
      ascBtn.style.background = "white";
      ascBtn.style.color = "#999";
      ascBtn.style.borderColor = "#FFD6E7";
    }
  }
  render();
}

// ─── Tab switching ────────────────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const on = btn.getAttribute("data-tab") === tab;
    btn.classList.toggle("active", on);
    btn.classList.toggle("text-pink-600", on);
    btn.classList.toggle("text-gray-400", !on);
  });
  document
    .querySelectorAll(".tab-content")
    .forEach((el) => el.classList.add("hidden"));
  const target = document.getElementById(`tab-${tab}`);
  if (target) {
    target.classList.remove("hidden");
    target.classList.add("fade-in");
  }
  render();
}

// ─── Full render ──────────────────────────────────────────────────────────────
function render() {
  if (activeTab === "overview") {
    renderMetrics();
    renderToday();
    renderUrgent();
    renderRoleSnapshot();
    updateCalendarEvents();
    renderAnalyticsChart();
  } else if (activeTab === "all") {
    renderKanban(null, "kanban-all", dateFilters.all || "all");
  } else {
    const roleIndex = roles.findIndex(
      (r) => r.toLowerCase().replace(/\s+/g, "_") === activeTab,
    );
    if (roleIndex !== -1) {
      const role = roles[roleIndex],
        roleKey = role.toLowerCase().replace(/\s+/g, "_");
      renderKanban(role, `kanban-${roleKey}`, dateFilters[roleKey] || "all");
    }
  }
}

// ─── Pomodoro ─────────────────────────────────────────────────────────────────
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(),
      now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.type = "sine";
      const t = now + i * 0.2;
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
      osc.start(t);
      osc.stop(t + 0.5);
    }
  } catch (_) {}
}

function updatePomoDisplay() {
  const disp = document.getElementById("pomo-display");
  const arc = document.getElementById("pomo-arc");
  if (!disp || !arc) return;
  disp.textContent = fmtSeconds(pomoSeconds);
  arc.style.strokeDashoffset = String(
    CIRCUMFERENCE * (1 - pomoSeconds / POMO_DURATIONS[pomoMode]),
  );
  arc.style.stroke = pomoMode === "focus" ? "#F8C8DC" : "#E6D6FF";

  // Sync float widget
  const floatDisp = document.getElementById("pomo-float-display");
  const floatBtn = document.getElementById("pomo-float-btn");
  const floatLabel = document.getElementById("pomo-float-label");
  if (floatDisp) floatDisp.textContent = fmtSeconds(pomoSeconds);
  if (floatBtn)
    floatBtn.textContent = pomoRunning
      ? "Pause"
      : pomoSeconds < POMO_DURATIONS[pomoMode]
        ? "Resume"
        : "Start";
  if (floatLabel)
    floatLabel.textContent =
      pomoMode === "focus" ? "Focus session" : "Short break";

  // Sync whichever PiP is active
  if (window._pipWindow && !window._pipWindow.closed) syncPiPWindow();
  else if (document.pictureInPictureElement) drawPiPFrame();
}

function pomoToggle() {
  if (pomoRunning) {
    clearInterval(pomoInterval);
    pomoRunning = false;
    setText("pomo-start-btn", "Resume");
  } else {
    pomoRunning = true;
    setText("pomo-start-btn", "Pause");
    pomoInterval = setInterval(() => {
      if (pomoSeconds <= 0) {
        playNotificationSound();
        if (pomoMode === "focus") {
          tomatoCount++;
          tomatoDate = todayISO();
          saveTomatoCount();
          updateTomatoDisplay();
        }
        pomoReset();
        return;
      }
      pomoSeconds--;
      updatePomoDisplay();
    }, 1000);
  }
}

function pomoReset() {
  clearInterval(pomoInterval);
  pomoRunning = false;
  pomoSeconds = POMO_DURATIONS[pomoMode];
  setText("pomo-start-btn", "Start");
  updatePomoDisplay();
}

function pomoSwitch() {
  clearInterval(pomoInterval);
  pomoRunning = false;
  pomoMode = pomoMode === "focus" ? "break" : "focus";
  pomoSeconds = POMO_DURATIONS[pomoMode];
  setText("pomo-start-btn", "Start");
  setText(
    "pomo-mode-label",
    pomoMode === "focus" ? "Focus session" : "Short break",
  );
  setText("pomo-switch-btn", pomoMode === "focus" ? "Break" : "Focus");
  updatePomoDisplay();
}

function updateTomatoDisplay() {
  const el = document.getElementById("tomato-counter");
  if (el) el.textContent = "🍅".repeat(tomatoCount);
}

function showPomodoroFloat() {
  const el = document.getElementById("pomo-float");
  if (el) {
    el.style.display = "flex";
    updatePomoDisplay();
  }
}

function hidePomodoroFloat() {
  const el = document.getElementById("pomo-float");
  if (el) el.style.display = "none";
}

// Drag logic
(function initPomoDrag() {
  document.addEventListener("DOMContentLoaded", () => {
    const el = document.getElementById("pomo-float");
    if (!el) return;
    let isDragging = false,
      startX,
      startY,
      startLeft,
      startBottom;

    el.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return; // don't drag when clicking buttons
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      startLeft = rect.left;
      startBottom = window.innerHeight - rect.bottom;
      el.style.cursor = "grabbing";
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newLeft = Math.max(
        0,
        Math.min(window.innerWidth - el.offsetWidth, startLeft + dx),
      );
      const newBottom = Math.max(
        0,
        Math.min(window.innerHeight - el.offsetHeight, startBottom - dy),
      );
      el.style.left = newLeft + "px";
      el.style.bottom = newBottom + "px";
      el.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
      el.style.cursor = "grab";
    });
  });
})();

// ─── Picture-in-Picture Timer ─────────────────────────────────────────────
let pipInterval = null;

function drawPiPFrame() {
  const canvas = document.getElementById("pip-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width,
    h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = "#FFF7FA";
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 20);
  ctx.fill();

  // Top accent strip
  const accent = ctx.createLinearGradient(0, 0, w, 0);
  accent.addColorStop(0, "#F8C8DC");
  accent.addColorStop(1, "#E6D6FF");
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, 6, [20, 20, 0, 0]);
  ctx.fill();

  // Mode pill background
  const pillW = 140,
    pillH = 22,
    pillX = (w - pillW) / 2,
    pillY = 18;
  ctx.fillStyle = pomoMode === "focus" ? "#FFE0EC" : "#E6D6FF";
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 99);
  ctx.fill();

  // Mode label
  ctx.fillStyle = pomoMode === "focus" ? "#C05070" : "#6040A0";
  ctx.font = "600 11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    pomoMode === "focus" ? "🌙  Focus Session" : "☕  Short Break",
    w / 2,
    pillY + pillH / 2,
  );

  // Timer ring (arc)
  const cx = w / 2,
    cy = 80,
    radius = 34;
  const progress = pomoSeconds / POMO_DURATIONS[pomoMode];

  // Ring track
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "#FFD6E7";
  ctx.lineWidth = 5;
  ctx.stroke();

  // Ring progress
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + Math.PI * 2 * progress;
  const ringGrad = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
  ringGrad.addColorStop(0, pomoMode === "focus" ? "#F8C8DC" : "#CDB8F5");
  ringGrad.addColorStop(1, pomoMode === "focus" ? "#E07090" : "#8060C0");
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.strokeStyle = ringGrad;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.stroke();

  // Timer text inside ring
  ctx.fillStyle = "#802840";
  ctx.font = "bold 22px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(fmtSeconds(pomoSeconds), cx, cy);

  // Status dot + text
  const dotX = w / 2 - 32;
  ctx.beginPath();
  ctx.arc(dotX, 118, 4, 0, Math.PI * 2);
  ctx.fillStyle = pomoRunning ? "#88C888" : "#F0A0C0";
  ctx.fill();

  ctx.fillStyle = pomoRunning ? "#4A8A4A" : "#C08090";
  ctx.font = "500 11px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(pomoRunning ? "Running" : "Paused", dotX + 10, 118);

  // Tomato count
  ctx.font = "12px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText("🍅".repeat(Math.min(tomatoCount, 6)), w - 14, 118);
}

async function launchPiP() {
  // Try modern Document PiP first (Chrome 116+)
  if ("documentPictureInPicture" in window) {
    await launchDocumentPiP();
    return;
  }
  // Fallback to canvas PiP
  if (
    !("pictureInPictureEnabled" in document) ||
    !document.pictureInPictureEnabled
  ) {
    alert("Picture-in-Picture is not supported in your browser. Try Chrome!");
    return;
  }
  await launchCanvasPiP();
}

async function launchDocumentPiP() {
  try {
    // Close existing PiP window if open
    if (window._pipWindow && !window._pipWindow.closed) {
      window._pipWindow.close();
    }

    const pipWin = await window.documentPictureInPicture.requestWindow({
      width: 300,
      height: 120,
    });
    window._pipWindow = pipWin;
    pipWin.document.title = "🌙 Moon DB Timer";

    // Inject styles
    const style = pipWin.document.createElement("style");
    style.textContent = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: 'DM Sans', sans-serif;
        background: #FFF7FA;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        overflow: hidden;
      }
      .pip-wrap {
        width: 100%;
        padding: 0.75rem 1rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        background: white;
        border: 1.5px solid #FFD6E7;
        border-radius: 1.25rem;
        margin: 0 0.5rem;
        box-shadow: 0 4px 16px rgba(200,80,120,0.12);
        position: relative;
      }
      .pip-accent {
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 4px;
        background: linear-gradient(to right, #F8C8DC, #E6D6FF);
        border-radius: 1.25rem 1.25rem 0 0;
      }
      .pip-icon { font-size: 1.25rem; flex-shrink: 0; }
      .pip-info { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; }
      .pip-label {
        font-size: 0.6rem; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.1em;
        color: #F0A0C0;
      }
      .pip-time {
        font-size: 1.4rem; font-weight: 700;
        font-family: 'DM Mono', monospace;
        color: #802840; line-height: 1;
      }
      .pip-buttons { display: flex; gap: 0.35rem; align-items: center; }
      .pip-btn {
        padding: 0.35rem 0.875rem;
        border: none; border-radius: 0.75rem;
        font-size: 0.78rem; font-weight: 600;
        cursor: pointer; font-family: inherit;
        transition: all 0.15s;
      }
      .pip-btn-main { background: #FFE0EC; color: #C05070; }
      .pip-btn-main:hover { background: #FFD0E0; }
      .pip-btn-reset {
        background: #F5F5F5; color: #999;
        padding: 0.35rem 0.5rem; font-size: 1rem;
      }
      .pip-btn-reset:hover { background: #EBEBEB; }
      .pip-tomatoes {
        font-size: 0.7rem; position: absolute;
        bottom: 0.4rem; right: 0.75rem;
        color: #F0A0C0;
      }
    `;
    pipWin.document.head.appendChild(style);

    // Build HTML
    pipWin.document.body.innerHTML = `
      <div class="pip-wrap">
        <div class="pip-accent"></div>
        <span class="pip-icon">🌙</span>
        <div class="pip-info">
          <span class="pip-label" id="pip-label">Focus Session</span>
          <span class="pip-time"  id="pip-time">25:00</span>
        </div>
        <div class="pip-buttons">
          <button class="pip-btn pip-btn-main"  id="pip-play">Start</button>
          <button class="pip-btn pip-btn-reset" id="pip-reset">↺</button>
        </div>
        <div class="pip-tomatoes" id="pip-tomatoes"></div>
      </div>
    `;

    // Wire up buttons to main window functions
    pipWin.document.getElementById("pip-play").addEventListener("click", () => {
      pomoToggle();
      syncPiPWindow();
    });
    pipWin.document
      .getElementById("pip-reset")
      .addEventListener("click", () => {
        pomoReset();
        syncPiPWindow();
      });

    // Initial sync
    syncPiPWindow();

    // Keep syncing every second
    clearInterval(pipInterval);
    pipInterval = setInterval(syncPiPWindow, 500);

    pipWin.addEventListener("pagehide", () => {
      clearInterval(pipInterval);
      window._pipWindow = null;
    });
  } catch (err) {
    console.error("Document PiP failed:", err);
    await launchCanvasPiP(); // fallback
  }
}

function syncPiPWindow() {
  const pipWin = window._pipWindow;
  if (!pipWin || pipWin.closed) {
    clearInterval(pipInterval);
    return;
  }

  const timeEl = pipWin.document.getElementById("pip-time");
  const labelEl = pipWin.document.getElementById("pip-label");
  const playBtn = pipWin.document.getElementById("pip-play");
  const tomatoesEl = pipWin.document.getElementById("pip-tomatoes");

  if (timeEl) timeEl.textContent = fmtSeconds(pomoSeconds);
  if (labelEl)
    labelEl.textContent =
      pomoMode === "focus" ? "Focus Session" : "Short Break";
  if (playBtn)
    playBtn.textContent = pomoRunning
      ? "Pause"
      : pomoSeconds < POMO_DURATIONS[pomoMode]
        ? "Resume"
        : "Start";
  if (tomatoesEl)
    tomatoesEl.textContent = "🍅".repeat(Math.min(tomatoCount, 5));
}

// Old canvas PiP kept as fallback
async function launchCanvasPiP() {
  const canvas = document.getElementById("pip-canvas");
  const video = document.getElementById("pip-video");
  if (!canvas || !video) return;

  drawPiPFrame();

  if (!video.srcObject) {
    const stream = canvas.captureStream(10);
    video.srcObject = stream;
  }

  await new Promise((resolve) => {
    if (video.readyState >= 2) {
      resolve();
      return;
    }
    video.oncanplay = () => resolve();
  });

  try {
    await video.play();
  } catch (err) {
    await new Promise((r) => setTimeout(r, 200));
    await video.play();
  }

  try {
    await video.requestPictureInPicture();
  } catch (err) {
    alert("Could not launch Picture-in-Picture.");
    console.error(err);
    return;
  }

  clearInterval(pipInterval);
  pipInterval = setInterval(drawPiPFrame, 500);
  video.addEventListener(
    "leavepictureinpicture",
    () => {
      clearInterval(pipInterval);
    },
    { once: true },
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ─── Dynamic tabs ─────────────────────────────────────────────────────────────
function renderNavTabs() {
  const nav = document.getElementById("nav-tabs");
  if (!nav) return;
  let html = `<button class="tab-btn text-sm font-medium px-4 py-3 text-pink-600" data-tab="overview" onclick="switchTab('overview')">Overview</button>`;
  roles.forEach((role) => {
    const key = role.toLowerCase().replace(/\s+/g, "_");
    html += `<button class="tab-btn text-sm font-medium px-4 py-3 text-gray-400" data-tab="${key}" onclick="switchTab('${key}')">${role}</button>`;
  });
  html += `<button class="tab-btn text-sm font-medium px-4 py-3 text-gray-400" data-tab="all" onclick="switchTab('all')">All tasks</button>`;
  nav.innerHTML = html;
  nav.querySelectorAll(".tab-btn").forEach((btn) => {
    const on = btn.getAttribute("data-tab") === activeTab;
    btn.classList.toggle("active", on);
    btn.classList.toggle("text-pink-600", on);
    btn.classList.toggle("text-gray-400", !on);
  });
}

function renderRoleTabs() {
  const container = document.getElementById("role-tabs-container");
  if (!container) return;
  container.innerHTML = roles
    .map((role) => {
      const key = role.toLowerCase().replace(/\s+/g, "_");
      return `
      <div id="tab-${key}" class="tab-content hidden fade-in">
        <div class="flex gap-2 mb-4 flex-wrap items-center">
          <button class="date-filter-badge active" onclick="setDateFilter('${key}','all')"   data-filter="all">All</button>
          <button class="date-filter-badge"        onclick="setDateFilter('${key}','today')" data-filter="today">Today</button>
          <button class="date-filter-badge"        onclick="setDateFilter('${key}','week')"  data-filter="week">This week</button>
          <button class="date-filter-badge"        onclick="setDateFilter('${key}','month')" data-filter="month">This month</button>
          <div style="margin-left:auto;display:flex;gap:0.5rem;">
            <button onclick="setSortDirection('${key}','asc')" id="sort-${key}-asc"
              title="Earliest first"
              style="padding:0.4rem 0.6rem;border-radius:0.75rem;font-size:0.9rem;cursor:pointer;transition:all 0.2s;background:white;color:#999;border:2px solid #FFD6E7;">
              ↑
            </button>
            <button onclick="setSortDirection('${key}','desc')" id="sort-${key}-desc"
              title="Latest first"
              style="padding:0.4rem 0.6rem;border-radius:0.75rem;font-size:0.9rem;cursor:pointer;transition:all 0.2s;background:white;color:#999;border:2px solid #FFD6E7;">
              ↓
            </button>
          </div>
        </div>
        <div id="kanban-${key}" class="kanban-board"></div>
      </div>`;
    })
    .join("");
}

// ─── Settings modal ───────────────────────────────────────────────────────────
function renderSettingsModal() {
  const editor = document.getElementById("roles-editor");
  if (!editor) return;
  let html = roles
    .map((role, i) => {
      const currentColorId = roleColorMap[role] || DEFAULT_COLOR_ID;
      const swatches = ROLE_COLORS.map((c) => {
        const sel = currentColorId === c.id;
        return `<button onclick="setRoleColor('${role}','${c.id}')" title="${c.id}" style="width:26px;height:26px;border-radius:50%;background:${c.bg};border:${sel ? `3px solid ${c.text}` : `2px solid ${c.border}`};cursor:pointer;box-shadow:${sel ? `0 0 0 2px white,0 0 0 4px ${c.border}` : "none"};transition:transform 0.15s;flex-shrink:0;" onmouseover="this.style.transform='scale(1.18)'" onmouseout="this.style.transform='scale(1)'"></button>`;
      }).join("");
      return `
      <div style="display:flex;flex-direction:column;gap:0.5rem;padding:0.75rem;background:#FFF8FB;border:1px solid #FFD6E7;border-radius:1rem;">
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <input type="text" value="${role}" maxlength="15" onchange="updateRole(${i},this.value)" style="flex:1;padding:0.5rem 0.75rem;border:1px solid #FFD6E7;border-radius:0.5rem;font-size:0.875rem;font-family:'DM Sans',sans-serif;outline:none;">
          <button onclick="deleteRole(${i})" style="padding:0.5rem 0.75rem;background:#FFE0E8;border:none;border-radius:0.5rem;color:#C05070;cursor:pointer;font-weight:500;font-size:0.8rem;font-family:'DM Sans',sans-serif;">Delete</button>
        </div>
        <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
          <span style="font-size:0.68rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#F0A0C0;white-space:nowrap;flex-shrink:0;">Color</span>
          <div style="display:flex;gap:0.35rem;flex-wrap:wrap;align-items:center;">${swatches}</div>
        </div>
      </div>`;
    })
    .join("");
  if (roles.length < 4)
    html += `<button onclick="addRole()" style="width:100%;padding:0.75rem;background:#E6D6FF;border:2px solid #A888E0;border-radius:0.75rem;color:#6040A0;font-weight:600;cursor:pointer;margin-top:0.5rem;font-family:'DM Sans',sans-serif;">+ Add Role</button>`;
  editor.innerHTML = html;
}

function setRoleColor(roleName, colorId) {
  roleColorMap[roleName] = colorId;
  saveToFirestore();
  renderSettingsModal();
  render();
  updateCalendarEvents();
}

function updateRole(index, newName) {
  if (!newName.trim()) return;
  const oldName = roles[index];
  roles[index] = newName.trim();
  if (roleColorMap[oldName]) {
    roleColorMap[newName.trim()] = roleColorMap[oldName];
    delete roleColorMap[oldName];
  }
  saveToFirestore();
  renderNavTabs();
  renderRoleTabs();
  render();
}

function deleteRole(index) {
  if (roles.length <= 1 || !confirm(`Delete role "${roles[index]}"?`)) return;
  const deletedKey = roles[index].toLowerCase().replace(/\s+/g, "_");
  roles.splice(index, 1);
  if (activeTab === deletedKey) activeTab = "overview";
  dateFilters = { all: "all" };
  roles.forEach((r) => {
    dateFilters[r.toLowerCase().replace(/\s+/g, "_")] = "all";
  });
  saveToFirestore();
  renderNavTabs();
  renderRoleTabs();
  render();
  renderSettingsModal();
}

function addRole() {
  if (roles.length >= 4) return;
  const newRole = prompt("Enter new role name (max 15 characters):");
  if (newRole && newRole.trim()) {
    const trimmed = newRole.trim().substring(0, 15);
    roles.push(trimmed);
    roles.forEach((r, i) => {
      if (!roleColorMap[r])
        roleColorMap[r] = ROLE_COLORS[i % ROLE_COLORS.length].id;
    });
    dateFilters[trimmed.toLowerCase().replace(/\s+/g, "_")] = "all";
    saveToFirestore();
    renderNavTabs();
    renderRoleTabs();
    render();
    renderSettingsModal();
  }
}

function openSettingsModal() {
  const modal = document.getElementById("settings-modal-overlay");
  if (modal) {
    renderSettingsModal();
    modal.classList.add("active");
  }
}

function closeSettingsModal(e) {
  if (e && e.target.id !== "settings-modal-overlay") return;
  document.getElementById("settings-modal-overlay")?.classList.remove("active");
}

function switchSettingsTab(tab) {
  // Update sidebar buttons
  document.querySelectorAll(".settings-tab").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.getElementById(`stab-${tab}`).classList.add("active");

  // Show/hide panels
  document.getElementById("spanel-roles").style.display =
    tab === "roles" ? "block" : "none";
  document.getElementById("spanel-data").style.display =
    tab === "data" ? "block" : "none";
}

// ─── Calendar ─────────────────────────────────────────────────────────────────
function getPriorityEventClass(priority) {
  return (
    { High: "event-high", Medium: "event-medium", Low: "event-low" }[
      priority
    ] || ""
  );
}

function getCalendarEvents() {
  const events = [];

  tasks
    .filter(
      (t) =>
        t.due &&
        (calendarRoleFilter === "all" || t.role === calendarRoleFilter),
    )
    .forEach((t) => {
      const roleOrder = roles.indexOf(t.role);
      const baseEvent = {
        id: `task-${t.id}`,
        title: t.title,
        start: t.due,
        end: t.due,
        order: roleOrder === -1 ? 999 : roleOrder,
        extendedProps: {
          taskId: t.id,
          role: t.role,
          priority: t.priority,
          status: t.status,
          done: t.done,
          eventBg: getRoleColor(t.role).eventBg,
          eventBorder: getRoleColor(t.role).eventBorder,
          eventText: getRoleColor(t.role).text,
        },
        classNames: [getPriorityEventClass(t.priority)],
        display: "block",
      };
      events.push(baseEvent);

      // For recurring tasks, also show them on the next 30 days
      if (t.recurring) {
        for (let d = 1; d <= 30; d++) {
          const futureDate = offsetDate(d);
          if (futureDate === t.due) continue; // skip if same as original due date
          events.push({
            ...baseEvent,
            id: `task-${t.id}-r${d}`,
            start: futureDate,
            end: futureDate,
            extendedProps: { ...baseEvent.extendedProps, done: false }, // future = always not done
          });
        }
      }
    });

  return events;
}

function initCalendar() {
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl) return;
  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,dayGridWeek",
    },
    eventOrder: "order,start,title",
    editable: true,
    eventDurationEditable: false,
    dayMaxEvents: false,
    height: "auto",
    contentHeight: "auto",
    events: getCalendarEvents(),
    eventDrop: function (info) {
      const task = tasks.find((t) => t.id === info.event.extendedProps.taskId);
      if (!task) {
        info.revert();
        return;
      }
      const d = info.event.start;
      task.due = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      saveData();
      if (activeTab === "overview") {
        renderMetrics();
        renderToday();
        renderUrgent();
      }
    },
    eventDidMount: function (info) {
      const props = info.event.extendedProps;
      if (props.done) {
        info.el.style.setProperty("background-color", "#F5F5F5", "important");
        info.el.style.setProperty("border-color", "#DDDDDD", "important");
        info.el.style.setProperty("opacity", "0.65", "important");
        const title = info.el.querySelector(".fc-event-title");
        if (title) {
          title.style.setProperty(
            "text-decoration",
            "line-through",
            "important",
          );
          title.style.setProperty("color", "#AAAAAA", "important");
        }
      } else {
        info.el.style.setProperty(
          "background-color",
          props.eventBg,
          "important",
        );
        info.el.style.setProperty(
          "border-color",
          props.eventBorder,
          "important",
        );
        info.el.style.setProperty("color", props.eventText, "important");
      }
      const inner = info.el.querySelector(".fc-event-main");
      if (inner)
        inner.style.setProperty(
          "color",
          props.done ? "#AAAAAA" : props.eventText,
          "important",
        );
    },
    eventClick: function (info) {
      const task = tasks.find((t) => t.id === info.event.extendedProps.taskId);
      if (task) showTaskDetail(task);
    },
    eventMouseEnter: function (info) {
      const task = tasks.find((t) => t.id === info.event.extendedProps.taskId);
      if (task)
        info.el.title = `${task.role} · ${task.priority} · ${task.status}`;
    },
    dayCellDidMount: function (info) {
      const dayTasks = tasks.filter((t) => t.due === info.dateStr && !t.done);
      if (dayTasks.length > 0)
        info.el.style.backgroundColor = "rgba(240,160,192,0.05)";
    },
  });
  calendar.render();
}

function updateCalendarEvents() {
  if (!calendar) return;
  calendar.removeAllEvents();
  calendar.addEventSource(getCalendarEvents());
}

function showTaskDetail(task) {
  const modal = document.getElementById("task-modal-overlay");
  if (!modal) return;
  window.currentModalTask = task;
  isEditingTaskTitle = false;
  document.getElementById("modal-task-title").classList.remove("hidden");
  document.getElementById("modal-task-title-input").classList.add("hidden");
  document.getElementById("modal-edit-buttons").classList.add("hidden");
  setText("modal-task-title", task.title);
  const sEl = document.getElementById("modal-status-pill");
  const pEl = document.getElementById("modal-priority-pill");
  const rEl = document.getElementById("modal-role-pill");
  const dEl = document.getElementById("modal-due-date");
  if (sEl) sEl.innerHTML = statusPill(task.status);
  if (pEl) pEl.innerHTML = priPill(task.priority);
  if (rEl) rEl.innerHTML = rolePill(task.role);
  if (dEl) dEl.textContent = task.due ? formatDate(task.due) : "No due date";
  const undoBtn = document.getElementById("modal-undo-btn");
  const doneBtn = document.getElementById("modal-done-btn");
  if (task.done) {
    if (undoBtn) undoBtn.classList.remove("hidden");
    if (doneBtn) doneBtn.classList.add("hidden");
  } else {
    if (undoBtn) undoBtn.classList.add("hidden");
    if (doneBtn) doneBtn.classList.remove("hidden");
  }
  modal.classList.add("active");
}

function closeTaskModal(e) {
  if (e && e.target.id !== "task-modal-overlay") return;
  document.getElementById("task-modal-overlay")?.classList.remove("active");
  window.currentModalTask = null;
}

function markTaskDone() {
  const task = window.currentModalTask;
  if (task) {
    task.done = true;
    task.status = "Done";
    saveData();
    render();
    closeTaskModal();
  }
}

function markTaskUndone() {
  const task = window.currentModalTask;
  if (task) {
    task.done = false;
    task.status = "Backlog";
    saveData();
    render();
    closeTaskModal();
  }
}

function deleteCurrentTask() {
  const task = window.currentModalTask;
  if (task && confirm(`Delete "${task.title}"?`)) {
    deleteTask(task.id);
    closeTaskModal();
  }
}

function duplicateCurrentTask() {
  const task = window.currentModalTask;
  if (!task) return;
  tasks.unshift({
    id: nextId++,
    title: task.title,
    role: task.role,
    status: "Backlog",
    priority: task.priority,
    due: task.due,
    done: false,
    recurring: task.recurring || false,
  });
  saveData();
  render();
  closeTaskModal();
}

// ─── Analytics ────────────────────────────────────────────────────────────────
function getAnalyticsData(filter) {
  const today = new Date(todayISO());
  let startDate = new Date(today);

  if (filter === "week")
    startDate.setDate(today.getDate() - 6); // last 7 days
  else if (filter === "month") startDate.setDate(today.getDate() - 29); // last 30 days
  // 'today' → startDate === today (single bar)

  const labels = [];
  const completedTasksData = [];
  const focusHoursData = [];

  const cur = new Date(startDate);
  while (cur <= today) {
    const dateStr = cur.toISOString().split("T")[0];
    labels.push(
      new Date(cur).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    );

    // Completed tasks whose due date matches this day
    completedTasksData.push(
      tasks.filter((t) => t.done && t.due === dateStr).length,
    );

    // Use pomoHistory for past days, live tomatoCount for today
    const dayPomos =
      dateStr === tomatoDate ? tomatoCount : pomoHistory[dateStr] || 0;
    const focusHours = Math.round(((dayPomos * 25) / 60) * 10) / 10;
    focusHoursData.push(focusHours);

    cur.setDate(cur.getDate() + 1);
  }

  return { labels, completedTasksData, focusHoursData };
}

function renderAnalyticsChart() {
  const data = getAnalyticsData(analyticsFilter);
  const ctx = document.getElementById("analyticsChart");
  if (!ctx) return;
  if (analyticsChart) {
    analyticsChart.destroy();
    analyticsChart = null;
  }

  analyticsChart = new Chart(ctx, {
    type: "bar",
    plugins: [barLabelPlugin],
    data: {
      labels: data.labels,
      datasets: [
        {
          label: "Completed Tasks",
          data: data.completedTasksData,
          backgroundColor: "#FFD6E7",
          borderColor: "#F8C8DC",
          borderWidth: 2,
          borderRadius: 6,
          yAxisID: "y",
        },
        {
          label: "Focus Hours",
          data: data.focusHoursData,
          backgroundColor: "#E6D6FF",
          borderColor: "#CDB8F5",
          borderWidth: 2,
          borderRadius: 6,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      clip: false,
      layout: { padding: { top: 20 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "top",
          labels: {
            font: { family: "'DM Sans', sans-serif", size: 12, weight: "500" },
            color: "#C05070",
            padding: 15,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: "#802840",
          titleColor: "#FFF7FA",
          bodyColor: "#FFF7FA",
          borderColor: "#F0A0C0",
          borderWidth: 1,
          padding: 10,
          titleFont: { family: "'DM Sans', sans-serif", weight: "600" },
          bodyFont: { family: "'DM Sans', sans-serif", size: 12 },
        },
      },
      scales: {
        x: {
          ticks: {
            font: { family: "'DM Sans', sans-serif", size: 11 },
            color: "#C08090",
          },
          grid: { display: false },
        },
        y: {
          type: "linear",
          display: true,
          position: "left",
          title: {
            display: true,
            text: "Completed Tasks",
            font: { family: "'DM Sans', sans-serif", weight: "500", size: 11 },
            color: "#C05070",
          },
          ticks: {
            font: { family: "'DM Sans', sans-serif", size: 11 },
            color: "#C08090",
            precision: 0,
          },
          grid: { color: "rgba(240, 160, 192, 0.1)" },
        },
        y1: {
          type: "linear",
          display: true,
          position: "right",
          title: {
            display: true,
            text: "Focus Hours",
            font: { family: "'DM Sans', sans-serif", weight: "500", size: 11 },
            color: "#6040A0",
          },
          ticks: {
            font: { family: "'DM Sans', sans-serif", size: 11 },
            color: "#6040A0",
          },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

function setAnalyticsFilter(filter) {
  analyticsFilter = filter;
  document.querySelectorAll(".analytics-filter-btn").forEach((btn) => {
    btn.classList.remove("active", "bg-pink-200", "text-pink-700");
    btn.classList.add("bg-white", "text-gray-500", "border", "border-pink-100");
  });
  const activeBtn = document.getElementById(`analytics-${filter}`);
  if (activeBtn) {
    activeBtn.classList.add("active", "bg-pink-200", "text-pink-700");
    activeBtn.classList.remove(
      "bg-white",
      "text-gray-500",
      "border",
      "border-pink-100",
    );
  }
  renderAnalyticsChart();
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(function init() {
  // ── DEV MODE: skip auth when running locally ──────────────────────────
  const isLocal =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "";

  if (isLocal) {
    console.log("🌙 Dev mode — skipping auth");
    // Mock a fake user
    currentUser = {
      uid: "dev-user",
      displayName: "Dev User",
      email: "dev@moondb.local",
      photoURL: null,
      updateProfile: () => Promise.resolve(),
    };
    updateUserDisplay(currentUser);
    showAppScreen();

    const todayEl = document.getElementById("today-label");
    if (todayEl)
      todayEl.textContent = new Date().toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

    // Load from localStorage instead of Firestore in dev
    loadFromLocalStorage();
    renderNavTabs();
    renderRoleTabs();
    updateRoleSelect();
    render();
    updatePomoDisplay();
    updateTomatoDisplay();
    setTimeout(() => {
      initCalendar();
    }, 100);
    setTimeout(() => {
      renderAnalyticsChart();
    }, 150);
    renderCalendarRoleFilter();

    const notepad = document.getElementById("notepad");
    if (notepad) {
      let noteTimer = 0;
      notepad.addEventListener("input", () => {
        clearTimeout(noteTimer);
        noteTimer = setTimeout(saveNote, 800);
      });
    }
    return; // skip the auth listener below
  }

  // ── PRODUCTION: normal Firebase auth ─────────────────────────────────
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      updateUserDisplay(user);
      showAppScreen();

      const todayEl = document.getElementById("today-label");
      if (todayEl)
        todayEl.textContent = new Date().toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });

      await loadFromFirestore();
      renderNavTabs();
      renderRoleTabs();
      updateRoleSelect();
      render();
      updatePomoDisplay();
      updateTomatoDisplay();
      setTimeout(() => {
        initCalendar();
      }, 100);
      setTimeout(() => {
        renderAnalyticsChart();
      }, 150);
      renderCalendarRoleFilter();

      const notepad = document.getElementById("notepad");
      if (notepad) {
        let noteTimer = 0;
        notepad.addEventListener("input", () => {
          clearTimeout(noteTimer);
          noteTimer = setTimeout(saveNote, 800);
        });
      }
    } else {
      currentUser = null;
      showLoginScreen();
    }
  });
})();

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem("moondb_dev");
    if (raw) {
      const d = JSON.parse(raw);
      tasks = d.tasks || [...SAMPLE_TASKS];
      nextId = d.nextId || 200;
      roles = d.roles || [...DEFAULT_ROLES];
      roleColorMap = d.roleColorMap || {};
      pomoHistory = d.pomoHistory || {};
      tomatoCount = d.tomatoDate === todayISO() ? d.tomatoCount || 0 : 0;
      tomatoDate = todayISO();
      const noteEl = document.getElementById("notepad");
      if (noteEl) noteEl.value = d.note || "";
    } else {
      tasks = [...SAMPLE_TASKS];
      nextId = 200;
      roles = [...DEFAULT_ROLES];
    }
  } catch (_) {
    tasks = [...SAMPLE_TASKS];
  }

  roles.forEach((r, i) => {
    if (!roleColorMap[r])
      roleColorMap[r] = ROLE_COLORS[i % ROLE_COLORS.length].id;
  });
  dateFilters = { all: "all" };
  roles.forEach((r) => {
    dateFilters[r.toLowerCase().replace(/\s+/g, "_")] = "all";
  });

  // Auto-move tasks due today from Backlog → In Progress
  tasks.forEach((t) => {
    if (!t.done && t.due === todayISO() && t.status === "Backlog") {
      t.status = "In Progress";
    }
  });
  saveToLocalStorage();
}

function saveToLocalStorage() {
  const noteEl = document.getElementById("notepad");
  try {
    localStorage.setItem(
      "moondb_dev",
      JSON.stringify({
        tasks,
        nextId,
        roles,
        roleColorMap,
        pomoHistory,
        tomatoCount,
        tomatoDate,
        note: noteEl ? noteEl.value : "",
      }),
    );
  } catch (_) {}
}

function saveData() {
  const isLocal =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "";
  if (isLocal) saveToLocalStorage();
  else saveToFirestore();
  if (activeTab === "overview") updateCalendarEvents();
}

// ─── Import/Export ────────────────────────────────────────────────────────────
function exportData() {
  const data = {
    tasks,
    nextId,
    roles,
    roleColorMap,
    pomoHistory,
    note: document.getElementById("notepad")?.value || "",
    tomatoCount,
    tomatoDate,
    displayName: currentUser?.displayName || "",
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `moon-db-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  alert("✅ Data exported successfully!");
}

function triggerImport() {
  document.getElementById("import-file").click();
}

async function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const imported = JSON.parse(e.target?.result);
      if (
        !confirm(
          `Import ${imported.tasks?.length || 0} tasks? This will replace your current data.`,
        )
      ) {
        event.target.value = "";
        return;
      }
      tasks = imported.tasks || [];
      nextId = imported.nextId || 200;
      roles = imported.roles || [...DEFAULT_ROLES];
      roleColorMap = imported.roleColorMap || {};
      tomatoCount = imported.tomatoCount || 0;
      tomatoDate = imported.tomatoDate || todayISO();
      pomoHistory = imported.pomoHistory || {};
      const noteEl = document.getElementById("notepad");
      if (noteEl) noteEl.value = imported.note || "";
      dateFilters = { all: "all" };
      roles.forEach((r) => {
        dateFilters[r.toLowerCase().replace(/\s+/g, "_")] = "all";
      });
      await saveToFirestore();
      renderNavTabs();
      renderRoleTabs();
      updateRoleSelect();
      render();
      updateTomatoDisplay();
      if (calendar) updateCalendarEvents();
      alert("✅ Data imported successfully!");
      closeSettingsModal();
      setTimeout(() => location.reload(), 500);
    } catch (err) {
      alert("❌ Import failed: Invalid JSON file");
      console.error("Import error:", err);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}
