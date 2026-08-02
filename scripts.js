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

// ─── Helpers ────────────────────────────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function offsetFromDate(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const today = new Date(todayISO());
  const start = new Date(t.due);
  const end = t.dueEnd ? new Date(t.dueEnd) : start;

  if (filter === "today") {
    const t0 = todayISO();
    return t.due <= t0 && (t.dueEnd || t.due) >= t0;
  }
  if (filter === "week") {
    const e = new Date(today); e.setDate(today.getDate() + 7);
    return start <= e && end >= today;
  }
  if (filter === "month") {
    const e = new Date(today); e.setMonth(today.getMonth() + 1);
    return start <= e && end >= today;
  }
  return true;
}

// ─── Sample data ──────────────────────────────────────────────────────────────

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

/** @type {Record<string, { total: number, roles: Record<string, number> }>} */
const SAMPLE_POMO_HISTORY = {
  [offsetDate(-6)]: { total: 3, roles: { "Role 1": 2, "Role 2": 1 } },
  [offsetDate(-5)]: { total: 5, roles: { "Role 1": 1, "Role 2": 2, "Role 3": 2 } },
  [offsetDate(-4)]: { total: 2, roles: { "Role 3": 2 } },
  [offsetDate(-3)]: { total: 6, roles: { "Role 1": 3, "Role 2": 1, "Role 3": 2 } },
  [offsetDate(-2)]: { total: 4, roles: { "Role 2": 2, "Role 3": 2 } },
  [offsetDate(-1)]: { total: 7, roles: { "Role 1": 4, "Role 2": 2, "Role 3": 1 } },
  [todayISO()]:     { total: 2, roles: { "Role 1": 1, "Role 3": 1 } },
};

// ─── State ──────────────────────────────────────────────────────────────────
/** @type {Task[]} */ let tasks = [];
let isGuestMode = false;
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

let pomoRole = null;
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

const KANBAN_PAGE_SIZE = 5;
let kanbanSearch = {};  
let kanbanPage = {};

let selectedTasks = new Set();

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
  if (isGuestMode) {
    isGuestMode = false;
    currentUser = null;
    showLoginScreen();
    return;
  }
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

function saveDisplayNameFromSettings() {
  const input = document.getElementById('settings-display-name');
  const newName = input?.value.trim();
  if (!newName) { alert('Name cannot be empty!'); return; }

  currentUser.updateProfile({ displayName: newName }).then(() => {
    updateUserDisplay(currentUser);
    if (isGuestMode) saveToLocalStorage();
    else userDoc().update({ displayName: newName }).catch(() => {});
    input.style.borderColor = '#88D8B8';
    setTimeout(() => { input.style.borderColor = '#FFD6E7'; }, 1500);
  }).catch(err => { console.error(err); alert('Failed to update name.'); });
}

function continueAsGuest() {
  isGuestMode = true;
  currentUser = {
    uid: "guest-user",
    displayName: "Guest",
    email: "",
    photoURL: null,
    updateProfile: (data) => {
      if (data.displayName) currentUser.displayName = data.displayName;
      return Promise.resolve();
    },
  };
  updateUserDisplay(currentUser);
  showAppScreen();

  const todayEl = document.getElementById("today-label");
  if (todayEl)
    todayEl.textContent = new Date().toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });

  loadFromLocalStorage();
  renderNavTabs();
  renderRoleTabs();
  updateRoleSelect();
  updatePomoRoleSelect();
  render();
  updatePomoDisplay();
  updateTomatoDisplay();
  setTimeout(() => initCalendar(), 100);
  setTimeout(() => renderAnalyticsChart(), 150);
  renderCalendarRoleFilter();

  const notepad = document.getElementById("notepad");
  if (notepad) {
    let noteTimer = 0;
    notepad.addEventListener("input", () => {
      clearTimeout(noteTimer);
      noteTimer = setTimeout(saveNote, 800);
    });
  }
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
      pomoHistory = data.pomoHistory || { ...SAMPLE_POMO_HISTORY };
      const noteEl = document.getElementById("notepad");
      if (noteEl) noteEl.value = data.note || "";
    } else {
      tasks = [...SAMPLE_TASKS];
      nextId = 200;
      roles = [...DEFAULT_ROLES];
      pomoHistory = { ...SAMPLE_POMO_HISTORY };
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
      t.due = todayISO(); // roll due date forward
      recurringReset = true;
    }
  });

  // Roll overdue recurring tasks forward to today (never completed)
  tasks.forEach((t) => {
    if (t.recurring && !t.done && t.due && t.due < todayISO()) {
      t.due = todayISO();
      recurringReset = true;
    }
  });

  if (recurringReset) saveToFirestore(); // or saveToLocalStorage() in the local version

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
  scheduleNotifications();
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
    }, { merge: true });
  } catch (err) {
    console.error("Error saving to Firestore:", err);
  }
}

function saveData() {
  if (isGuestMode) saveToLocalStorage();
  else saveToFirestore();
  if (activeTab === "overview") updateCalendarEvents();
}

async function saveNote() {
  const saved = document.getElementById("note-saved");
  if (isGuestMode) {
    saveToLocalStorage();
    if (saved) { saved.textContent = "✓ saved"; setTimeout(() => (saved.textContent = ""), 1500); }
    return;
  }
  if (!currentUser) return;
  const el = document.getElementById("notepad");
  try {
    await userDoc().update({ note: el.value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  } catch (_) {
    await saveToFirestore();
  }
  if (saved) { saved.textContent = "✓ saved"; setTimeout(() => (saved.textContent = ""), 1500); }
}

function saveTomatoCount() {
  const existing = pomoHistory[tomatoDate];
  const base = (existing && typeof existing === "object") ? existing : { total: (typeof existing === "number" ? existing : 0), roles: {} };
  const updated = { total: tomatoCount, roles: { ...base.roles } };
  if (pomoRole) updated.roles[pomoRole] = (updated.roles[pomoRole] || 0) + 1;
  pomoHistory[tomatoDate] = updated;

  if (isGuestMode) { saveToLocalStorage(); return; }
  userDoc().update({ tomatoCount, tomatoDate, pomoHistory }).catch(() => saveToFirestore());
}

function showLoadingState(loading) {
  const el = document.getElementById("loading-overlay");
  if (el) el.classList.toggle("hidden", !loading);
}

// ─── Render: Overview ─────────────────────────────────────────────────────────
function renderMetrics() {
  const active    = tasks.filter(t => !t.done);
  const completed = tasks.filter(t => t.done);
  const blocked   = active.filter(t => t.status === 'Blocked');

  setText('m-total',     String(active.length));
  setText('m-completed', String(completed.length));
  setText('m-blocked',   String(blocked.length));

  // Row 2: per role — today's in-progress tasks
  const rolesEl = document.getElementById('m-roles');
  if (!rolesEl) return;

  // Dynamic grid columns based on role count
  rolesEl.style.gridTemplateColumns = `repeat(${roles.length}, minmax(0, 1fr))`;

  rolesEl.innerHTML = roles.map(r => {
    const c         = getRoleColor(r);
    const todayTasks = tasks.filter(t => t.role === r && t.due === todayISO() && !t.done && t.status === 'In Progress');
    return `
      <div style="background:${c.bg};border:1px solid ${c.border};border-radius:1rem;padding:1rem;">
        <p style="font-size:0.7rem;font-weight:600;color:${c.text};margin-bottom:0.25rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r}</p>
        <p style="font-size:1.5rem;font-weight:600;color:${c.text};">${todayTasks.length}</p>
        <p style="font-size:0.65rem;color:${c.text};opacity:0.7;margin-top:0.1rem;">in progress today</p>
      </div>`;
  }).join('');
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
      <span style="font-size:1rem;flex-shrink:0;margin-top:1px;"><i class="ph-bold ph-arrows-clockwise"></i></span>
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

  const tabKey = role === null ? "all" : role.toLowerCase().replace(/\s+/g, "_");

  let filtered = tasks.filter(
    (t) => (role === null || t.role === role) && matchesDateFilter(t, dateFilter),
  );

  const search = (kanbanSearch[tabKey] || "").trim().toLowerCase();
  if (search) {
    filtered = filtered.filter((t) => t.title.toLowerCase().includes(search));
  }

  const sortDir = sortDirections[tabKey] || "asc";
  filtered = filtered.sort((a, b) => {
    const aDate = a.due ? new Date(a.due) : new Date("9999-12-31");
    const bDate = b.due ? new Date(b.due) : new Date("9999-12-31");
    return sortDir === "asc" ? aDate - bDate : bDate - aDate;
  });

  let html = "";
  for (const status of STATUSES) {
    const statusTasks = filtered.filter((t) => t.status === status);
    const pageKey = `${tabKey}-${status}`;
    const totalPages = Math.max(1, Math.ceil(statusTasks.length / KANBAN_PAGE_SIZE));
    let curPage = kanbanPage[pageKey] || 0;
    curPage = Math.min(Math.max(curPage, 0), totalPages - 1);
    kanbanPage[pageKey] = curPage;
    const pageTasks = statusTasks.slice(curPage * KANBAN_PAGE_SIZE, curPage * KANBAN_PAGE_SIZE + KANBAN_PAGE_SIZE);

    html += `
      <div class="kanban-column">
        <div class="kanban-column-header">
          <div class="kanban-column-title">${status}</div>
          <div class="kanban-column-count">${statusTasks.length}</div>
        </div>
        <div class="kanban-drop-zone" data-status="${status}"
          ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)">
          ${pageTasks.length
            ? pageTasks.map((t) => taskCardHTML(t, role === null)).join("")
            : `<div class="kanban-empty">${statusTasks.length ? "No tasks on this page" : (search ? "No matches" : "Drop tasks here")}</div>`}
        </div>
        ${totalPages > 1 ? `
        <div class="kanban-pagination">
          <button class="kanban-page-btn" onclick="changeKanbanPage('${pageKey}',-1)" ${curPage === 0 ? "disabled" : ""}>
            <i class="ph-bold ph-caret-left"></i>
          </button>
          <span class="kanban-page-label">${curPage + 1} / ${totalPages}</span>
          <button class="kanban-page-btn" onclick="changeKanbanPage('${pageKey}',1)" ${curPage === totalPages - 1 ? "disabled" : ""}>
            <i class="ph-bold ph-caret-right"></i>
          </button>
        </div>` : ""}
      </div>`;
  }

  if (isMobile) {
    const activeCol = el.dataset.mobileCol || "In Progress";
    const tabsHtml = `
      <div class="kanban-mobile-tabs" style="display:flex;gap:0.5rem;margin-bottom:1rem;overflow-x:auto;padding-bottom:0.25rem;">
        ${STATUSES.map(s => `
          <button onclick="setMobileKanbanCol('${elId}','${s}')"
            style="flex-shrink:0;padding:0.4rem 1rem;border-radius:0.75rem;font-size:0.8rem;font-weight:600;cursor:pointer;border:2px solid ${activeCol===s?'#A888E0':'#FFD6E7'};background:${activeCol===s?'#E6D6FF':'white'};color:${activeCol===s?'#6040A0':'#999'};transition:all 0.2s;">
            ${s}
          </button>`).join('')}
      </div>`;
    el.innerHTML = tabsHtml + html;
    el.querySelectorAll('.kanban-column').forEach(col => {
      const title = col.querySelector('.kanban-column-title')?.textContent?.trim();
      col.classList.toggle('mobile-active', title === activeCol);
    });
  } else {
    el.innerHTML = html;
  }
}

function changeKanbanPage(pageKey, dir) {
  kanbanPage[pageKey] = (kanbanPage[pageKey] || 0) + dir;
  render();
}

function setKanbanSearch(tabKey, value) {
  kanbanSearch[tabKey] = value;
  STATUSES.forEach((s) => { kanbanPage[`${tabKey}-${s}`] = 0; }); // reset pages on new search
  render();
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
    ? `<span style="font-size:10px;background:#FFF0F5;color:#C05070;border:1px solid #FFD6E7;border-radius:99px;padding:1px 6px;font-weight:500;"><i class="ph-bold ph-arrows-clockwise"> Daily</i></span>`
    : "";
  return `
    <div class="task-card" draggable="true" id="card-${t.id}" style="border-left:3px solid ${c.border};"
      ondragstart="handleDragStart(event,${t.id})" ondragend="handleDragEnd(event)">
      <input type="checkbox" class="task-select-box" data-id="${t.id}"
        ${selectedTasks.has(t.id) ? "checked" : ""}
        onclick="event.stopPropagation()"
        onchange="toggleSelectTask(${t.id}, this.checked)"
        style="position:absolute;top:8px;right:8px;width:16px;height:16px;cursor:pointer;accent-color:#A888E0;" />
      <div class="task-card-title">${t.title}</div>
      <div class="task-card-meta">
        ${showRole ? rolePill(t.role) : ""}
        ${statusPill(t.status)}${priPill(t.priority)}
        ${recurringBadge}
      </div>
      <div class="task-card-bottom">
        ${t.dueEnd
          ? `<span style="font-size:0.75rem;color:#A03858;font-weight:500;">${formatDate(t.due)} → ${formatDate(t.dueEnd)}</span>`
          : `<input type="date" class="task-card-due" value="${t.due || ""}"
              style="padding:0.25rem 0.5rem;border:1px solid #FFD6E7;border-radius:0.375rem;font-size:0.75rem;cursor:pointer;"
              onchange="updateTaskDue(${t.id},this.value)" />`}
          <div style="display:flex;gap:0.25rem;align-items:center;">
          <button class="task-card-delete" onclick="toggleRecurring(${t.id})" title="${t.recurring ? "Remove recurring" : "Mark as recurring"}" style="opacity:0.6;font-size:0.85rem;">${t.recurring ? "<i class='ph-bold ph-arrows-clockwise'></i>" : "<i class='ph-bold ph-arrows-clockwise'></i>"}</button>
          <button class="task-card-delete" onclick="duplicateTask(${t.id})" title="Duplicate" style="opacity:0.6;"><i class="ph-bold ph-copy"></i></button>
          <button class="task-card-delete" onclick="deleteTask(${t.id})"><i class="ph-bold ph-x"></i></button>
          <button class="task-card-delete" onclick="toggleTaskNotify(${t.id})"
            title="${t.notify ? 'Turn off notification' : 'Turn on notification'}"
            style="opacity:${t.notify ? '1' : '0.6'};color:${t.notify ? '#c05070' : 'inherit'};">
            <i class="ph-bold ${t.notify ? 'ph-bell-ringing' : 'ph-bell'}"></i>
          </button>
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
          ${t.recurring ? `<span style="font-size:10px;color:#C05070;"><i class="ph-bold ph-arrows-clockwise"></i></span>` : ""}
          ${t.due ? `<span class="text-[11px] font-mono ${overdue && !t.done ? "text-red-400 font-semibold" : "text-gray-300"}">${formatDate(t.due)}</span>` : ""}
        </div>
      </div>
      ${showDelete ? `<button class="text-pink-200 hover:text-pink-400 text-base w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 transition" onclick="deleteTask(${t.id})">×</button>` : ""}
    </div>`;
}

function toggleSelectTask(id, checked) {
  if (checked) selectedTasks.add(id);
  else selectedTasks.delete(id);
}

function toggleSelectAll(elId, checked) {
  const boxes = document.querySelectorAll(`#${elId} .task-select-box`);
  boxes.forEach(b => {
    const id = Number(b.dataset.id);
    b.checked = checked;
    checked ? selectedTasks.add(id) : selectedTasks.delete(id);
  });
}

let pendingBulkAction = null; // { elId, type: 'done' | 'delete' }

function bulkMarkDone(elId) {
  const ids = [...document.querySelectorAll(`#${elId} .task-select-box:checked`)].map(b => Number(b.dataset.id));
  if (!ids.length) return;
  showBulkConfirm(elId, 'done', ids.length);
}

function bulkDelete(elId) {
  const ids = [...document.querySelectorAll(`#${elId} .task-select-box:checked`)].map(b => Number(b.dataset.id));
  if (!ids.length) return;
  showBulkConfirm(elId, 'delete', ids.length);
}

function showBulkConfirm(elId, type, count) {
  pendingBulkAction = { elId, type };
  const icon = document.getElementById('bulk-confirm-icon');
  const title = document.getElementById('bulk-confirm-title');
  const msg = document.getElementById('bulk-confirm-message');
  const btn = document.getElementById('bulk-confirm-action-btn');

  if (type === 'delete') {
    icon.textContent = '🗑️';
    icon.style.background = '#FFE0E8';
    title.textContent = `Delete ${count} task${count > 1 ? 's' : ''}?`;
    msg.textContent = "This can't be undone.";
    btn.textContent = 'Delete';
    btn.className = 'bulk-confirm-btn danger';
  } else {
    icon.textContent = '✓';
    icon.style.background = '#E6D6FF';
    title.textContent = `Mark ${count} task${count > 1 ? 's' : ''} as done?`;
    msg.textContent = "You can undo this later from the task.";
    btn.textContent = 'Mark done';
    btn.className = 'bulk-confirm-btn success';
  }
  btn.onclick = confirmBulkAction;
  document.getElementById('bulk-confirm-overlay').classList.add('active');
}

function closeBulkConfirm(e) {
  if (e && e.target.id !== 'bulk-confirm-overlay') return;
  document.getElementById('bulk-confirm-overlay').classList.remove('active');
  pendingBulkAction = null;
}

function confirmBulkAction() {
  if (!pendingBulkAction) return;
  const { elId, type } = pendingBulkAction;
  const ids = [...document.querySelectorAll(`#${elId} .task-select-box:checked`)].map(b => Number(b.dataset.id));

  if (type === 'done') {
    tasks.forEach(t => {
      if (ids.includes(t.id)) {
        t.done = true;
        t.status = "Done";
        t.doneDate = todayISO();
      }
    });
  } else if (type === 'delete') {
    tasks = tasks.filter(t => !ids.includes(t.id));
  }

  selectedTasks.clear();
  saveData();
  render();
  closeBulkConfirm();
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
    notify: orig.notify || false,         
    notifyInterval: orig.notifyInterval || 60, 
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

function openAddTaskModal() {
  updateRoleSelect();
  document.getElementById("quick-input").value = "";
  document.getElementById("qf-due").value = todayISO();
  dateMode = "single";
  multiDates = [];
  rangeStart = null;
  rangeEnd = null;
  document.getElementById("qf-multi-date-chips").innerHTML = "";
  const countEl = document.getElementById("qf-range-count");
  if (countEl) countEl.textContent = "";
  setDateMode("single");
  document.getElementById("add-task-modal-overlay").classList.add("active");
  setTimeout(() => document.getElementById("quick-input").focus(), 50);
}

function closeAddTaskModal(e) {
  if (e && e.target.id !== "add-task-modal-overlay") return;
  document.getElementById("add-task-modal-overlay")?.classList.remove("active");
}

let dateMode = "single";
let multiDates = [];

function setDateMode(mode) {
  dateMode = mode;
  ["single", "multiple", "range"].forEach((m) => {
    document.getElementById(`qf-date-${m}`).classList.toggle("hidden", m !== mode);
    document.getElementById(`dm-${m}`).classList.toggle("active", m === mode);
  });
  if (mode === "multiple") renderMiniCalendar("multiple");
  if (mode === "range") renderMiniCalendar("range");
}

// ─── Mini calendar ────────────────
let miniCalMonthMulti = new Date();
let miniCalMonthRange = new Date();
let rangeStart = null;
let rangeEnd = null;

function pad2(n) { return String(n).padStart(2, "0"); }
function ymd(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

function navMiniCal(mode, dir) {
  if (mode === "multiple") miniCalMonthMulti.setMonth(miniCalMonthMulti.getMonth() + dir);
  else miniCalMonthRange.setMonth(miniCalMonthRange.getMonth() + dir);
  renderMiniCalendar(mode);
}

function renderMiniCalendar(mode) {
  const monthDate = mode === "multiple" ? miniCalMonthMulti : miniCalMonthRange;
  const containerId = mode === "multiple" ? "mini-cal-multiple" : "mini-cal-range";
  const el = document.getElementById(containerId);
  if (!el) return;

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDayIdx = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const today = todayISO();
  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];

  let cells = "";
  for (let i = 0; i < firstDayIdx; i++) cells += `<div class="mini-cal-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = ymd(year, month, d);
    let cls = "mini-cal-day";
    if (dateStr === today) cls += " today";

    if (mode === "multiple") {
      if (multiDates.includes(dateStr)) cls += " selected";
    } else {
      if (dateStr === rangeStart) cls += " range-start";
      else if (dateStr === rangeEnd) cls += " range-end";
      else if (rangeStart && rangeEnd && dateStr > rangeStart && dateStr < rangeEnd) cls += " range-mid";
    }
    cells += `<button type="button" class="${cls}" onclick="onMiniCalDayClick('${mode}','${dateStr}')">${d}</button>`;
  }

  el.innerHTML = `
    <div class="mini-cal-header">
      <button type="button" class="mini-cal-nav-btn" onclick="navMiniCal('${mode}',-1)"><i class="ph-bold ph-caret-left"></i></button>
      <span class="mini-cal-title">${monthLabel}</span>
      <button type="button" class="mini-cal-nav-btn" onclick="navMiniCal('${mode}',1)"><i class="ph-bold ph-caret-right"></i></button>
    </div>
    <div class="mini-cal-weekdays">${weekdays.map(w => `<span class="mini-cal-weekday">${w}</span>`).join("")}</div>
    <div class="mini-cal-grid">${cells}</div>`;
}

function onMiniCalDayClick(mode, dateStr) {
  if (mode === "multiple") {
    if (multiDates.includes(dateStr)) multiDates = multiDates.filter(d => d !== dateStr);
    else { multiDates.push(dateStr); multiDates.sort(); }
    renderMiniCalendar("multiple");
    renderMultiDateChips();
  } else {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      rangeStart = dateStr; rangeEnd = null;
    } else if (dateStr < rangeStart) {
      rangeEnd = rangeStart; rangeStart = dateStr;
    } else {
      rangeEnd = dateStr;
    }
    renderMiniCalendar("range");
    updateRangeCount();
  }
}

function removeMultiDate(date) {
  multiDates = multiDates.filter((d) => d !== date);
  renderMiniCalendar("multiple");
  renderMultiDateChips();
}

function renderMultiDateChips() {
  const el = document.getElementById("qf-multi-date-chips");
  if (!el) return;
  el.innerHTML = multiDates
    .map(d => `
    <span class="date-chip">
      ${formatDate(d)}
      <button type="button" onclick="removeMultiDate('${d}')" title="Remove"><i class="ph-bold ph-x"></i></button>
    </span>`).join("");
}

function updateRangeCount() {
  const countEl = document.getElementById("qf-range-count");
  if (!countEl) return;
  if (!rangeStart || !rangeEnd) { countEl.textContent = rangeStart ? "Pick an end date" : ""; return; }
  const days = getRangeDates(rangeStart, rangeEnd).length;
  countEl.textContent = `${days} task${days > 1 ? "s" : ""} will be created (${formatDate(rangeStart)} → ${formatDate(rangeEnd)})`;
}

function renderMultiDateChips() {
  const el = document.getElementById("qf-multi-date-chips");
  if (!el) return;
  el.innerHTML = multiDates
    .map(
      (d) => `
    <span class="date-chip">
      ${formatDate(d)}
      <button type="button" onclick="removeMultiDate('${d}')" title="Remove"><i class="ph-bold ph-x"></i></button>
    </span>`,
    )
    .join("");
}

function getRangeDates(start, end) {
  const dates = [];
  let cur = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (cur <= last) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function updateRoleSelect() {
  const sel = document.getElementById("qf-role");
  if (sel) sel.innerHTML = roles.map((r) => `<option>${r}</option>`).join("");
}

function updatePomoRoleSelect() {
  const menu = document.getElementById("pomo-dropdown-menu");
  if (!menu) return;

  // Keep pomoRole in sync if role was renamed/deleted
  if (pomoRole && !roles.includes(pomoRole)) pomoRole = null;

  menu.innerHTML = `<div class="pomo-dropdown-option ${!pomoRole ? "selected" : ""}" onclick="selectPomoRole('', this)">— No role —</div>` +
    roles.map(r => `<div class="pomo-dropdown-option ${r === pomoRole ? "selected" : ""}" onclick="selectPomoRole('${r}', this)">${r}</div>`).join("");
}

function selectPomoRole(role, el) {
  pomoRole = role || null;
  document.getElementById("pomo-role-label").textContent = role || "— No role —";
  document.querySelectorAll(".pomo-dropdown-option").forEach(o => o.classList.remove("selected"));
  el.classList.add("selected");
  togglePomoDropdown(); // close after selecting
}

function togglePomoDropdown() {
  const dropdown = document.getElementById("pomo-role-dropdown");
  if (dropdown?.classList.contains("disabled")) return;
  dropdown?.classList.toggle("open");
}

function saveQuickTask() {
  const title = document.getElementById("quick-input").value.trim();
  if (!title) { alert("Please enter a task title."); return; }
  quickTitle = title;
  const role = document.getElementById("qf-role").value;
  const priority = document.getElementById("qf-priority").value;
  const status = document.getElementById("qf-status").value;
  const recurring = document.getElementById("qf-recurring").checked;

  if (dateMode === "range") {
    if (!rangeStart || !rangeEnd) {
      alert("Please select a start and end date.");
      return;
    }
    tasks.unshift({
      id: nextId++, title: quickTitle, role, status, priority,
      due: rangeStart, dueEnd: rangeEnd,
      done: false, recurring, notify: false, notifyInterval: 60,
    });
    saveData();
    render();
    closeAddTaskModal();
    return;
  }

  let dueDates = dateMode === "single"
    ? [document.getElementById("qf-due").value]
    : [...multiDates];

  if (!dueDates.length || dueDates.some((d) => !d)) {
    alert("Please select at least one valid date.");
    return;
  }

  dueDates.forEach((due) => {
    tasks.unshift({
      id: nextId++, title: quickTitle, role, status, priority, due,
      done: false, recurring, notify: false, notifyInterval: 60,
    });
  });

  saveData();
  render();
  closeAddTaskModal();
}

document.addEventListener("DOMContentLoaded", () => {
  const startEl = document.getElementById("qf-range-start");
  const endEl = document.getElementById("qf-range-end");
  const countEl = document.getElementById("qf-range-count");
  function updateRangeCount() {
    if (!startEl.value || !endEl.value || !countEl) { if (countEl) countEl.textContent = ""; return; }
    const days = getRangeDates(startEl.value, endEl.value).length;
    countEl.textContent = days > 0 ? `${days} task${days > 1 ? "s" : ""} will be created` : "";
  }
  startEl?.addEventListener("change", updateRangeCount);
  endEl?.addEventListener("change", updateRangeCount);
});

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
    const ctx = getAudioContext();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.28, ctx.currentTime);
    master.connect(ctx.destination);

    // Soft chime note helper
    function chime(freq, startTime, duration, volume = 1) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      // Slight detune for warmth — two oscillators per note
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();

      osc.type = "sine";
      osc2.type = "sine";
      osc.frequency.value = freq;
      osc2.frequency.value = freq * 1.002; // subtle detune

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.02); // quick attack
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      gain2.gain.setValueAtTime(0, startTime);
      gain2.gain.linearRampToValueAtTime(volume * 0.6, startTime + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      osc2.connect(gain2);
      gain.connect(master);
      gain2.connect(master);

      osc.start(startTime);
      osc.stop(startTime + duration);
      osc2.start(startTime);
      osc2.stop(startTime + duration);
    }

    // Harmonic pad helper — sustained background warmth
    function pad(freq, startTime, duration) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.06, startTime + 0.3);
      gain.gain.linearRampToValueAtTime(0.06, startTime + duration - 0.5);
      gain.gain.linearRampToValueAtTime(0, startTime + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(startTime);
      osc.stop(startTime + duration);
    }

    const t = ctx.currentTime;

    // Opening chime — ascending phrase (C5, E5, G5, C6)
    chime(523.25, t + 0.0,  2.0, 1.0);   // C5
    chime(659.25, t + 0.4,  2.0, 0.9);   // E5
    chime(783.99, t + 0.8,  2.2, 0.85);  // G5
    chime(1046.5, t + 1.2,  2.5, 0.8);   // C6 — peak

    // Gentle resolution — descending (G5, E5, C5)
    chime(783.99, t + 2.2,  1.8, 0.6);   // G5
    chime(659.25, t + 2.9,  1.8, 0.5);   // E5
    chime(523.25, t + 3.5,  2.0, 0.45);  // C5 — settle

    // Warm pad underneath the whole sequence
    pad(261.63, t, 5.5);   // C4
    pad(329.63, t, 5.5);   // E4
    pad(392.00, t, 5.5);   // G4

  } catch (_) {}
}

// Shared AudioContext — created once on user interaction
let sharedAudioCtx = null;

function getAudioContext() {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
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
  const roleSel = document.getElementById("pomo-role-select");
  if (pomoRunning) {
    clearInterval(pomoInterval);
    pomoRunning = false;
    setText("pomo-start-btn", "Resume");
    document.getElementById("pomo-role-dropdown")?.classList.remove("disabled");
    
  } else {
    pomoRunning = true;
    setText("pomo-start-btn", "Pause");
    document.getElementById("pomo-role-dropdown")?.classList.add("disabled");
    pomoInterval = setInterval(() => {
      if (pomoSeconds <= 0) {
        playNotificationSound();
        if (pomoMode === "focus") {
          tomatoCount++;
          tomatoDate = todayISO();
          saveTomatoCount(); // now records the role too
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
  const roleSel = document.getElementById("pomo-role-select");
  if (roleSel) roleSel.disabled = false;
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

document.addEventListener("click", (e) => {
  if (!e.target.closest("#pomo-role-dropdown")) {
    document.getElementById("pomo-role-dropdown")?.classList.remove("open");
  }
});

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
        <div class="flex gap-2 mb-3 flex-wrap items-center">
          <div class="kanban-search-wrap">
            <i class="ph-bold ph-magnifying-glass"></i>
            <input type="text" id="search-${key}" placeholder="Search tasks..."
              oninput="setKanbanSearch('${key}', this.value)" class="kanban-search-input" />
          </div>
        </div>
        <div class="flex gap-2 mb-4 flex-wrap items-center">
          <button class="date-filter-badge active" onclick="setDateFilter('${key}','all')"   data-filter="all">All</button>
          <button class="date-filter-badge"        onclick="setDateFilter('${key}','today')" data-filter="today">Today</button>
          <button class="date-filter-badge"        onclick="setDateFilter('${key}','week')"  data-filter="week">This week</button>
          <button class="date-filter-badge"        onclick="setDateFilter('${key}','month')" data-filter="month">This month</button>
          <div style="margin-left:auto;display:flex;gap:0.5rem;">
            <button onclick="setSortDirection('${key}','asc')" id="sort-${key}-asc"
              title="Earliest first"
              style="padding:0.4rem 0.6rem;border-radius:0.75rem;font-size:0.9rem;cursor:pointer;transition:all 0.2s;background:white;color:#999;border:2px solid #FFD6E7;">
              <i class="ph-bold ph-arrow-up"></i>
            </button>
            <button onclick="setSortDirection('${key}','desc')" id="sort-${key}-desc"
              title="Latest first"
              style="padding:0.4rem 0.6rem;border-radius:0.75rem;font-size:0.9rem;cursor:pointer;transition:all 0.2s;background:white;color:#999;border:2px solid #FFD6E7;">
              <i class="ph-bold ph-arrow-down"></i>
            </button>
          </div>
        </div>
        <div class="flex items-center gap-3 mb-3">
          <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.8rem;color:#C08090;cursor:pointer;">
            <input type="checkbox" id="select-all-kanban-${key}" onchange="toggleSelectAll('kanban-${key}', this.checked)" />
            Select all
          </label>
          <button onclick="bulkMarkDone('kanban-${key}')" class="text-xs px-3 py-1 rounded-lg bg-lavender-200 text-lavender-700 hover:bg-lavender-300">Mark done</button>
          <button onclick="bulkDelete('kanban-${key}')" class="text-xs px-3 py-1 rounded-lg bg-red-100 text-red-500 hover:bg-red-200">Delete</button>
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
    html += `<button onclick="addRole()" style="width:100%;padding:0.75rem;background:#E6D6FF;border:2px solid #A888E0;border-radius:0.75rem;color:#6040A0;font-weight:600;cursor:pointer;margin-top:0.5rem;font-family:'DM Sans',sans-serif;"><i class="ph-bold ph-plus"></i> Add Role</button>`;
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
  const modal = document.getElementById('settings-modal-overlay');
  if (modal) {
    renderSettingsModal();
    // Pre-fill display name
    const nameInput = document.getElementById('settings-display-name');
    if (nameInput) nameInput.value = currentUser?.displayName || '';
    modal.classList.add('active');
  }
}

function closeSettingsModal(e) {
  if (e && e.target.id !== "settings-modal-overlay") return;
  document.getElementById("settings-modal-overlay")?.classList.remove("active");
}

function switchSettingsTab(tab) {
  document.querySelectorAll('.settings-tab').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`stab-${tab}`).classList.add('active');

  document.getElementById('spanel-roles').style.display = tab === 'roles'   ? 'block' : 'none';
  document.getElementById('spanel-data').style.display = tab === 'data'    ? 'block' : 'none';
  document.getElementById('spanel-account').style.display = tab === 'account' ? 'block' : 'none';
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
      // Ranged task → single spanning event
      if (t.dueEnd) {
        events.push({
          id: `task-${t.id}`,
          title: t.title,
          start: t.due,
          end: offsetFromDate(t.dueEnd, 1),
          order: roleOrder === -1 ? 999 : roleOrder,
          extendedProps: {
            taskId: t.id, role: t.role, priority: t.priority,
            status: t.status, done: t.done,
            eventBg: getRoleColor(t.role).eventBg,
            eventBorder: getRoleColor(t.role).eventBorder,
            eventText: getRoleColor(t.role).text,
          },
          classNames: [getPriorityEventClass(t.priority)],
          display: "block",
        });
        return; // skip the normal single-day / recurring logic below
      }

      const baseEvent = {
        id: `task-${t.id}`,
        title: t.title,
        order: roleOrder === -1 ? 999 : roleOrder,
        extendedProps: {
          taskId: t.id,
          role: t.role,
          priority: t.priority,
          status: t.status,
          eventBg: getRoleColor(t.role).eventBg,
          eventBorder: getRoleColor(t.role).eventBorder,
          eventText: getRoleColor(t.role).text,
        },
        classNames: [getPriorityEventClass(t.priority)],
        display: "block",
      };

      if (!t.recurring) {
        events.push({ ...baseEvent, start: t.due, end: t.due, extendedProps: { ...baseEvent.extendedProps, done: t.done } });
        return;
      }

      // Recurring: always show today (d=0) through +30 days
      const earliestShow = t.due < todayISO() ? todayISO() : t.due;
      for (let d = 0; d <= 30; d++) {
        const occurDate = offsetDate(d);
        if (occurDate < earliestShow) continue;
        events.push({
          ...baseEvent,
          id: `task-${t.id}-r${d}`,
          start: occurDate,
          end: occurDate,
          extendedProps: {
            ...baseEvent.extendedProps,
            done: occurDate === todayISO() ? t.done : false,
          },
        });
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
      if (!task) { info.revert(); return; }

      const deltaDays = info.delta.days; // exact day shift FullCalendar calculated

      task.due = offsetFromDate(task.due, deltaDays);
      if (task.dueEnd) {
        task.dueEnd = offsetFromDate(task.dueEnd, deltaDays);
      }

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
  if (dEl) dEl.textContent = task.dueEnd
    ? `${formatDate(task.due)} → ${formatDate(task.dueEnd)}`
    : (task.due ? formatDate(task.due) : "No due date");

  // Notification section
  const notifEl = document.getElementById("modal-notify-section");
  if (notifEl) {
    const intervals = [30, 60, 120, 240];
    notifEl.innerHTML = `
      <div class="modal-label" style="margin-bottom:0.5rem;">Notification</div>
      <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
        <button onclick="toggleTaskNotify(${task.id})"
          style="display:flex;align-items:center;gap:0.4rem;padding:0.4rem 0.85rem;border-radius:0.75rem;font-size:0.8rem;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;border:1.5px solid ${task.notify ? '#f0a0c0' : '#ffd6e7'};background:${task.notify ? '#ffe0ec' : '#fff7fa'};color:${task.notify ? '#c05070' : '#c0a0b0'};">
          <i class="ph-bold ${task.notify ? 'ph-bell-ringing' : 'ph-bell'}"></i>
          ${task.notify ? 'On' : 'Off'}
        </button>
        ${task.notify ? `
          <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
            ${intervals.map(m => `
              <button onclick="setTaskNotifyInterval(${task.id}, ${m})"
                style="padding:0.35rem 0.65rem;border-radius:0.65rem;font-size:0.75rem;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;border:1.5px solid ${task.notifyInterval === m ? '#f0a0c0' : '#ffd6e7'};background:${task.notifyInterval === m ? '#ffe0ec' : 'white'};color:${task.notifyInterval === m ? '#c05070' : '#c0a0b0'};">
                ${m < 60 ? `${m}m` : `${m/60}h`}
              </button>`).join('')}
          </div>` : ''}
      </div>`;
  }

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
    notify: task.notify || false,
    notifyInterval: task.notifyInterval || 60,
  });
  saveData();
  render();
  closeTaskModal();
}

// ─── Analytics ────────────────────────────────────────────────────────────────
function getAnalyticsData(filter) {
  const rolePomoData = {}; // { "Role 1": [hours per day...], ... }
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
    const dayData = getDayPomos(dateStr);
    const focusHours = Math.round(((dayData.total * 25) / 60) * 10) / 10;
    focusHoursData.push(focusHours);
    // Accumulate per-role
    roles.forEach(r => {
      rolePomoData[r] = rolePomoData[r] || [];
      const rolePomos = dayData.roles[r] || 0;
      rolePomoData[r].push(Math.round(((rolePomos * 25) / 60) * 10) / 10);
    });

    cur.setDate(cur.getDate() + 1);
  }

  return { labels, completedTasksData, focusHoursData, rolePomoData };
}

// Helper to safely read a day's entry regardless of old/new format
function getDayPomos(dateStr) {
  if (dateStr === tomatoDate) {
    return { total: tomatoCount, roles: pomoHistory[tomatoDate]?.roles || {} };
  }
  const entry = pomoHistory[dateStr];
  if (!entry) return { total: 0, roles: {} };
  if (typeof entry === "number") return { total: entry, roles: {} }; // legacy
  return entry;
}

function renderAnalyticsChart() {
  const data = getAnalyticsData(analyticsFilter);

  // Build one dataset per role
  const roleDatasets = roles.map(r => {
    const c = getRoleColor(r);
    return {
      label: `${r} (focus hrs)`,
      data: data.rolePomoData[r] || [],
      backgroundColor: c.bg,
      borderColor: c.border,
      borderWidth: 2,
      borderRadius: 6,
      yAxisID: "y1",
      stack: "roleHours", // stacked so they don't overlap
    };
  });

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
        ...roleDatasets,  // replaces the single "Focus Hours" dataset
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
          stacked: true,
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

// ─── Notifications ────────────────────────────────────────────────────────────
let notifTimers = {}; // { taskId: intervalId }

function scheduleNotifications() {
  // Clear all existing timers first
  Object.values(notifTimers).forEach(id => clearInterval(id));
  notifTimers = {};

  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const today = todayISO();

  tasks.forEach(t => {
    if (!t.notify || t.done) return;           // skip if notify off or done
    if (!t.due || t.due < today) return;       // skip if overdue or no due date
    if (t.due > today) return;                 // skip if not due today

    const intervalMs = (t.notifyInterval || 60) * 60 * 1000;
    notifTimers[t.id] = setInterval(() => {
      // Re-check conditions at fire time
      const task = tasks.find(x => x.id === t.id);
      if (!task || task.done || !task.notify) {
        clearInterval(notifTimers[t.id]);
        delete notifTimers[t.id];
        return;
      }
      fireNotification(task);
    }, intervalMs);

    // Fire once immediately on schedule so user knows it's active
    fireNotification(t);
  });
}

function fireNotification(task) {
  if (Notification.permission !== "granted") return;
  playNotificationSound();
  const c = getRoleColor(task.role);
  const n = new Notification(`🌙 ${task.title}`, {
    body: `${task.role} · ${task.priority} priority · Due ${formatDate(task.due)}`,
    icon: "https://ik.imagekit.io/e3wiv79bq/Assets-DP/Moon%20DB.ico",
    tag: `task-${task.id}`, // replaces previous notif for same task
    silent: true,
  });
  n.onclick = () => {
    window.focus();
    showTaskDetail(task);
    n.close();
  };
}

function toggleTaskNotify(id) {
  getAudioContext();
  const t = tasks.find(x => x.id === id);
  if (!t) return;

  if (Notification.permission === "denied") {
    alert("Notifications are blocked. Please enable them in your browser settings.");
    return;
  }

  if (Notification.permission === "default") {
    Notification.requestPermission().then(perm => {
      if (perm === "granted") toggleTaskNotify(id); // retry after grant
    });
    return;
  }

  t.notify = !t.notify;
  if (t.notify && !t.notifyInterval) t.notifyInterval = 60; 
  saveData();
  scheduleNotifications();
  render();

  // If modal is open, re-render it
  if (window.currentModalTask?.id === id) showTaskDetail(t);
}

function setTaskNotifyInterval(id, minutes) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  t.notifyInterval = parseInt(minutes);
  saveData();
  scheduleNotifications();
  if (window.currentModalTask?.id === id) showTaskDetail(t);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(function init() {
  // ── DEV MODE: skip auth when running locally ──────────────────────────
  const isLocal =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "";

  // Request notification permission on startup
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }

  if (isLocal) {
    isGuestMode = true;
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
    updatePomoRoleSelect();
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
      updatePomoRoleSelect();
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
      pomoHistory = d.pomoHistory || { ...SAMPLE_POMO_HISTORY };
      tomatoCount = d.tomatoDate === todayISO() ? d.tomatoCount || 0 : 0;
      tomatoDate = todayISO();
      const noteEl = document.getElementById("notepad");
      if (noteEl) noteEl.value = d.note || "";
    } else {
      tasks = [...SAMPLE_TASKS];
      nextId = 200;
      roles = [...DEFAULT_ROLES];
      pomoHistory = { ...SAMPLE_POMO_HISTORY };
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

  // Reset recurring tasks that were completed on a previous day
  let recurringReset = false;
  tasks.forEach((t) => {
    if (t.recurring && t.done && t.doneDate && t.doneDate !== todayISO()) {
      t.done = false;
      t.status = "In Progress";
      t.doneDate = "";
      t.due = todayISO();
      recurringReset = true;
    }
  });

  // Roll overdue recurring tasks forward to today (never completed)
  tasks.forEach((t) => {
    if (t.recurring && !t.done && t.due && t.due < todayISO()) {
      t.due = todayISO();
      recurringReset = true;
    }
  });

  // Auto-move tasks due today from Backlog → In Progress
  tasks.forEach((t) => {
    if (!t.done && t.due === todayISO() && t.status === "Backlog") {
      t.status = "In Progress";
    }
  });
  saveToLocalStorage();
  scheduleNotifications();
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

// Re-run scheduler at midnight
(function scheduleMidnightRefresh() {
  const now = new Date();
  const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  setTimeout(() => {
    scheduleNotifications();
    scheduleMidnightRefresh(); // reschedule for next midnight
  }, msUntilMidnight);
})();

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
      updatePomoRoleSelect();
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
