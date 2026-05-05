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
 */

// ─── Firebase Config ────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyC8q4jLNUkZVa31F5BP9FXVQxZiJQVoAX8",
  authDomain:        "moon-db-42f38.firebaseapp.com",
  projectId:         "moon-db-42f38",
  storageBucket:     "moon-db-42f38.firebasestorage.app",
  messagingSenderId: "769692711280",
  appId:             "1:769692711280:web:6d3584dd59ef851fe4f7b5",
  measurementId:     "G-65E6SEG369",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// ─── Constants ─────────────────────────────────────────────────────────────
const POMO_DURATIONS   = { focus: 25 * 60, break: 5 * 60 };
const CIRCUMFERENCE    = 2 * Math.PI * 40;
const STATUSES         = ['In Progress', 'Backlog', 'Blocked', 'Done'];
const DEFAULT_ROLES    = ['QA', 'Marketing', 'Finance'];
const DEFAULT_COLOR_ID = 'rose';

const ROLE_COLORS = [
  { id: 'rose',     bg: '#FFE0EC', border: '#F4AACB', text: '#A03060', eventBg: '#FFD6E7', eventBorder: '#F8C8DC' },
  { id: 'lavender', bg: '#EDE0FF', border: '#CDB8F5', text: '#6040A0', eventBg: '#E6D6FF', eventBorder: '#CDB8F5' },
  { id: 'sky',      bg: '#DCEEFF', border: '#A8CEFF', text: '#2060A0', eventBg: '#D0E8FF', eventBorder: '#A0C8F8' },
  { id: 'mint',     bg: '#D6F0E8', border: '#88D8B8', text: '#207060', eventBg: '#C8EAD8', eventBorder: '#80C8A8' },
  { id: 'peach',    bg: '#FFE8D0', border: '#FFBF88', text: '#A05020', eventBg: '#FFD8B8', eventBorder: '#F8AE78' },
  { id: 'lemon',    bg: '#FFFAD0', border: '#F0D860', text: '#806010', eventBg: '#FFF4A8', eventBorder: '#E8CC50' },
  { id: 'lilac',    bg: '#F0E0FF', border: '#D0A8F0', text: '#702090', eventBg: '#E8D0FF', eventBorder: '#C098E8' },
];

/** @type {Task[]} */
const SAMPLE_TASKS = [
  { id:1, title:'Write regression test cases for login flow',   role:'QA',        status:'In Progress', priority:'High',   due: todayISO(),    done: false },
  { id:2, title:'Review API error handling coverage',           role:'QA',        status:'Backlog',     priority:'Medium', due: offsetDate(2), done: false },
  { id:3, title:'Draft Q2 social media calendar',               role:'Marketing', status:'In Progress', priority:'High',   due: offsetDate(1), done: false },
  { id:4, title:'Update email newsletter template',             role:'Marketing', status:'Blocked',     priority:'Medium', due: offsetDate(3), done: false },
  { id:5, title:'Reconcile April expense report',               role:'Finance',   status:'In Progress', priority:'High',   due: todayISO(),    done: false },
  { id:6, title:'Prepare invoice batch for freelance clients',  role:'Finance',   status:'Backlog',     priority:'Medium', due: offsetDate(5), done: false },
];

// ─── State ──────────────────────────────────────────────────────────────────
/** @type {Task[]} */                let tasks        = [];
let nextId       = 200;
let activeTab    = 'overview';
/** @type {string[]} */              let roles        = [...DEFAULT_ROLES];
/** @type {Record<string,string>} */ let roleColorMap = {};
let dateFilters  = {};
let draggedTask  = null;
let calendar     = null;
/** @type {Object|null} */           let currentUser  = null;

let pomoMode    = 'focus';
let pomoRunning = false;
let pomoSeconds = POMO_DURATIONS.focus;
/** @type {number|null} */ let pomoInterval = null;
let tomatoCount = 0;
let tomatoDate  = todayISO();
let quickTitle  = '';

// ─── Helpers ────────────────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().split('T')[0]; }

function offsetDate(days) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatDate(iso) {
  if (!iso) return '';
  const t = todayISO();
  if (iso === t) return 'Today';
  const diff = Math.round((new Date(iso + 'T00:00:00') - new Date(t + 'T00:00:00')) / 86400000);
  if (diff === 1)  return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0)    return `${Math.abs(diff)}d overdue`;
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isUrgent(t) {
  if (t.done) return false;
  if (!t.due) return t.priority === 'High';
  return t.due <= todayISO();
}

function fmtSeconds(s) {
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

function matchesDateFilter(t, filter) {
  if (filter === 'all' || !t.due) return true;
  const today = new Date(todayISO()), due = new Date(t.due);
  if (filter === 'today') return t.due === todayISO();
  if (filter === 'week')  { const e = new Date(today); e.setDate(today.getDate() + 7);   return due >= today && due <= e; }
  if (filter === 'month') { const e = new Date(today); e.setMonth(today.getMonth() + 1);  return due >= today && due <= e; }
  return true;
}

// ─── Auth helpers ────────────────────────────────────────────────────────────
function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => {
    console.error('Sign-in error:', err);
    alert('Sign-in failed. Please try again.');
  });
}

function signOut() {
  if (!confirm('Sign out of Moon DB?')) return;
  auth.signOut();
}

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showAppScreen() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

function updateUserDisplay(user) {
  const nameEl   = document.getElementById('user-name');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl) nameEl.textContent = user.displayName || user.email;
  if (avatarEl) {
    avatarEl.innerHTML = user.photoURL
      ? `<img src="${user.photoURL}" alt="avatar" style="width:28px;height:28px;border-radius:50%;object-fit:cover;" />`
      : `<span style="width:28px;height:28px;border-radius:50%;background:#F8C8DC;color:#802840;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;">${(user.displayName || user.email || 'U')[0].toUpperCase()}</span>`;
  }
}

// ─── Color helpers ────────────────────────────────────────────────────────────
function getRoleColor(role) {
  const colorId = roleColorMap[role] || DEFAULT_COLOR_ID;
  return ROLE_COLORS.find(c => c.id === colorId) || ROLE_COLORS[0];
}

// ─── Pill helpers ─────────────────────────────────────────────────────────────
function rolePill(r) {
  const c = getRoleColor(r);
  return `<span class="pill text-[11px] font-medium px-2 py-0.5 rounded-full" style="background:${c.bg};color:${c.text};border:1px solid ${c.border};">${r}</span>`;
}
function priPill(p) {
  const map = { High:'bg-red-100 text-red-500', Medium:'bg-amber-100 text-amber-600', Low:'bg-green-100 text-green-600' };
  return `<span class="pill text-[11px] font-medium px-2 py-0.5 rounded-full ${map[p]||''}">${p}</span>`;
}
function statusPill(s) {
  const map = { 'In Progress':'bg-blue-100 text-blue-500','Blocked':'bg-red-100 text-red-400','Done':'bg-gray-100 text-gray-400','Backlog':'bg-gray-50 text-gray-300' };
  return `<span class="pill text-[11px] font-medium px-2 py-0.5 rounded-full ${map[s]||''}">${s}</span>`;
}

// ─── Firestore persistence ────────────────────────────────────────────────────
function userDoc() {
  return db.collection('users').doc(currentUser.uid);
}

async function loadFromFirestore() {
  if (!currentUser) return;
  showLoadingState(true);
  try {
    const doc = await userDoc().get();
    if (doc.exists) {
      const data   = doc.data();
      tasks        = data.tasks        || [...SAMPLE_TASKS];
      nextId       = data.nextId       || 200;
      roles        = data.roles        || [...DEFAULT_ROLES];
      roleColorMap = data.roleColorMap || {};
      tomatoCount  = data.tomatoDate === todayISO() ? (data.tomatoCount || 0) : 0;
      tomatoDate   = todayISO();
      const noteEl = document.getElementById('notepad');
      if (noteEl) noteEl.value = data.note || '';
    } else {
      // First sign-in — seed with sample data
      tasks  = [...SAMPLE_TASKS];
      nextId = 200;
      roles  = [...DEFAULT_ROLES];
      await saveToFirestore();
    }
  } catch (err) {
    console.error('Error loading from Firestore:', err);
  }

  // Assign default colors for any role missing one
  roles.forEach((r, i) => {
    if (!roleColorMap[r]) roleColorMap[r] = ROLE_COLORS[i % ROLE_COLORS.length].id;
  });

  // Init date filters
  dateFilters = { all: 'all' };
  roles.forEach(r => { dateFilters[r.toLowerCase().replace(/\s+/g, '_')] = 'all'; });

  showLoadingState(false);
}

async function saveToFirestore() {
  if (!currentUser) return;
  const noteEl = document.getElementById('notepad');
  try {
    await userDoc().set({
      tasks, nextId, roles, roleColorMap, tomatoCount, tomatoDate,
      note:      noteEl ? noteEl.value : '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('Error saving to Firestore:', err);
  }
}

function saveData() {
  saveToFirestore();
  if (activeTab === 'overview') updateCalendarEvents();
}

async function saveNote() {
  if (!currentUser) return;
  const el = /** @type {HTMLTextAreaElement} */ (document.getElementById('notepad'));
  try {
    await userDoc().update({ note: el.value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  } catch (_) { await saveToFirestore(); }
  const saved = document.getElementById('note-saved');
  if (saved) { saved.textContent = '✓ saved'; setTimeout(() => { saved.textContent = ''; }, 1500); }
}

function saveTomatoCount() {
  if (!currentUser) return;
  userDoc().update({ tomatoCount, tomatoDate }).catch(() => saveToFirestore());
}

function showLoadingState(loading) {
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.toggle('hidden', !loading);
}

// ─── Render: Overview ─────────────────────────────────────────────────────────
function renderMetrics() {
  const active = tasks.filter(t => !t.done);
  setText('m-total',      String(active.length));
  setText('m-inprogress', String(active.filter(t => t.status === 'In Progress').length));
  setText('m-blocked',    String(active.filter(t => t.status === 'Blocked').length));
}

function renderToday() {
  const el = document.getElementById('today-list'); if (!el) return;
  const top = tasks
    .filter(t => !t.done && (t.priority === 'High' || t.due === todayISO()))
    .sort((a,b) => ['High','Medium','Low'].indexOf(a.priority) - ['High','Medium','Low'].indexOf(b.priority))
    .slice(0, 5);
  el.innerHTML = top.length
    ? top.map(t => taskRowHTML(t, false)).join('')
    : `<p class="text-sm text-pink-200 text-center py-4">All clear — nothing urgent today!</p>`;
}

function renderUrgent() {
  const el = document.getElementById('urgent-list'); if (!el) return;
  const urg = tasks.filter(isUrgent).slice(0, 4);
  el.innerHTML = urg.length
    ? urg.map(t => `
        <div class="flex items-start gap-2 p-2 rounded-xl bg-pink-50 border border-pink-100 mb-2 last:mb-0">
          <span class="mt-1 w-1.5 h-1.5 rounded-full bg-pink-400 flex-shrink-0"></span>
          <div>
            <p class="text-xs font-medium text-pink-700 leading-snug">${t.title}</p>
            <p class="text-[10px] text-pink-400 mt-0.5">${t.role} · ${t.due ? formatDate(t.due) : t.priority}</p>
          </div>
        </div>`).join('')
    : `<p class="text-xs text-pink-200 text-center py-2">Nothing urgent!</p>`;
}

function renderRoleSnapshot() {
  const el = document.getElementById('role-snapshot'); if (!el) return;
  el.innerHTML = roles.map(r => {
    const rt = tasks.filter(t => t.role === r && !t.done);
    return `
      <div class="flex items-center justify-between py-2 border-b border-pink-50 last:border-none">
        <span class="text-sm font-medium text-gray-600 w-20">${r}</span>
        <div class="flex items-center gap-3 text-xs font-mono">
          <span class="text-gray-300">${rt.filter(t=>t.status==='Backlog').length}</span>
          <span class="text-blue-300">${rt.filter(t=>t.status==='In Progress').length}</span>
          <span class="text-red-300">${rt.filter(t=>t.status==='Blocked').length}</span>
        </div>
      </div>`;
  }).join('');
}

// ─── Render: Kanban ───────────────────────────────────────────────────────────
function renderKanban(role, elId, dateFilter) {
  const el = document.getElementById(elId); if (!el) return;
  const filtered = tasks.filter(t => (role === null || t.role === role) && matchesDateFilter(t, dateFilter));
  let html = '';
  for (const status of STATUSES) {
    const statusTasks = filtered.filter(t => t.status === status);
    html += `
      <div class="kanban-column">
        <div class="kanban-column-header">
          <div class="kanban-column-title">${status}</div>
          <div class="kanban-column-count">${statusTasks.length}</div>
        </div>
        <div class="kanban-drop-zone" data-status="${status}"
          ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)">
          ${statusTasks.length ? statusTasks.map(t => taskCardHTML(t, role === null)).join('') : '<div class="kanban-empty">Drop tasks here</div>'}
        </div>
      </div>`;
  }
  el.innerHTML = html;
}

function taskCardHTML(t, showRole) {
  const c = getRoleColor(t.role);
  return `
    <div class="task-card" draggable="true" id="card-${t.id}" style="border-left:3px solid ${c.border};"
      ondragstart="handleDragStart(event,${t.id})" ondragend="handleDragEnd(event)">
      <div class="task-card-title">${t.title}</div>
      <div class="task-card-meta">
        ${showRole ? rolePill(t.role) : ''}
        ${statusPill(t.status)}${priPill(t.priority)}
      </div>
      <div class="task-card-bottom">
        <input type="date" class="task-card-due" value="${t.due||''}"
          style="padding:0.25rem 0.5rem;border:1px solid #FFD6E7;border-radius:0.375rem;font-size:0.75rem;cursor:pointer;"
          onchange="updateTaskDue(${t.id},this.value)" />
        <div style="display:flex;gap:0.25rem;">
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
        class="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition ${t.done?'bg-lavender-200 border-lavender-300':'border-pink-200 hover:border-pink-400'}">
        ${t.done?'<span class="w-1.5 h-1.5 rounded-full bg-lavender-500 block"></span>':''}
      </button>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-gray-700 leading-snug ${t.done?'line-through text-gray-300':''}">${t.title}</p>
        <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
          ${rolePill(t.role)}${statusPill(t.status)}${priPill(t.priority)}
          ${t.due?`<span class="text-[11px] font-mono ${overdue&&!t.done?'text-red-400 font-semibold':'text-gray-300'}">${formatDate(t.due)}</span>`:''}
        </div>
      </div>
      ${showDelete?`<button class="text-pink-200 hover:text-pink-400 text-base w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 transition" onclick="deleteTask(${t.id})">×</button>`:''}
    </div>`;
}

// ─── Drag and drop ────────────────────────────────────────────────────────────
function handleDragStart(e, taskId) {
  draggedTask = taskId;
  const card = document.getElementById(`card-${taskId}`);
  if (card) card.classList.add('dragging');
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function handleDragEnd() {
  document.querySelectorAll('.kanban-drop-zone').forEach(z => z.classList.remove('drag-over'));
  if (draggedTask) { const c = document.getElementById(`card-${draggedTask}`); if (c) c.classList.remove('dragging'); }
}
function handleDragOver(e) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  if (e.currentTarget) e.currentTarget.classList.add('drag-over');
}
function handleDragLeave(e) {
  if (e.currentTarget && e.target === e.currentTarget) e.currentTarget.classList.remove('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  const zone = /** @type {HTMLElement} */ (e.currentTarget);
  zone.classList.remove('drag-over');
  if (!draggedTask) return;
  const task = tasks.find(t => t.id === draggedTask);
  if (task) {
    task.status = zone.getAttribute('data-status');
    task.done   = task.status === 'Done';
    if (task.status !== 'Done' && task.done) task.done = false;
  }
  saveData(); render();
  draggedTask = null;
}

// ─── Actions ──────────────────────────────────────────────────────────────────
function toggleDone(id) {
  const t = tasks.find(x => x.id === id);
  if (t) { t.done = !t.done; t.status = t.done ? 'Done' : 'Backlog'; }
  saveData(); render();
}
function deleteTask(id) { tasks = tasks.filter(x => x.id !== id); saveData(); render(); }
function duplicateTask(id) {
  const orig = tasks.find(x => x.id === id); if (!orig) return;
  tasks.unshift({ id: nextId++, title: orig.title, role: orig.role, status: 'Backlog', priority: orig.priority, due: orig.due, done: false });
  saveData(); render();
}
function updateTaskDue(id, newDue) {
  const t = tasks.find(x => x.id === id);
  if (t) { t.due = newDue; saveData(); render(); }
}
function quickAdd() {
  const input = /** @type {HTMLInputElement} */ (document.getElementById('quick-input'));
  quickTitle = input.value.trim(); if (!quickTitle) return;
  updateRoleSelect();
  document.getElementById('quick-form').classList.remove('hidden');
  /** @type {HTMLInputElement} */ (document.getElementById('qf-due')).value = todayISO();
}
function updateRoleSelect() {
  const sel = document.getElementById('qf-role');
  if (sel) sel.innerHTML = roles.map(r => `<option>${r}</option>`).join('');
}
function cancelQuick() {
  document.getElementById('quick-form').classList.add('hidden');
  /** @type {HTMLInputElement} */ (document.getElementById('quick-input')).value = '';
  quickTitle = '';
}
function saveQuickTask() {
  const role = document.getElementById('qf-role').value;
  const priority = document.getElementById('qf-priority').value;
  const status   = document.getElementById('qf-status').value;
  const due      = /** @type {HTMLInputElement} */ (document.getElementById('qf-due')).value;
  tasks.unshift({ id: nextId++, title: quickTitle, role, status, priority, due, done: false });
  saveData(); render(); cancelQuick();
}
function setDateFilter(tab, filter) {
  dateFilters[tab] = filter;
  document.querySelectorAll(`#tab-${tab} .date-filter-badge`).forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
  });
  render();
}

// ─── Tab switching ────────────────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const on = btn.getAttribute('data-tab') === tab;
    btn.classList.toggle('active', on);
    btn.classList.toggle('text-pink-600', on);
    btn.classList.toggle('text-gray-400', !on);
  });
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  const target = document.getElementById(`tab-${tab}`);
  if (target) { target.classList.remove('hidden'); target.classList.add('fade-in'); }
  render();
}

// ─── Full render ──────────────────────────────────────────────────────────────
function render() {
  if (activeTab === 'overview') {
    renderMetrics(); renderToday(); renderUrgent(); renderRoleSnapshot(); updateCalendarEvents();
  } else if (activeTab === 'all') {
    renderKanban(null, 'kanban-all', dateFilters.all || 'all');
  } else {
    const roleIndex = roles.findIndex(r => r.toLowerCase().replace(/\s+/g, '_') === activeTab);
    if (roleIndex !== -1) {
      const role = roles[roleIndex], roleKey = role.toLowerCase().replace(/\s+/g, '_');
      renderKanban(role, `kanban-${roleKey}`, dateFilters[roleKey] || 'all');
    }
  }
}

// ─── Pomodoro ─────────────────────────────────────────────────────────────────
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(), now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 800; osc.type = 'sine';
      const t = now + i * 0.2;
      gain.gain.setValueAtTime(0.3, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
      osc.start(t); osc.stop(t + 0.5);
    }
  } catch (_) {}
}
function updatePomoDisplay() {
  const disp = document.getElementById('pomo-display');
  const arc  = /** @type {SVGCircleElement|null} */ (document.getElementById('pomo-arc'));
  if (!disp || !arc) return;
  disp.textContent = fmtSeconds(pomoSeconds);
  arc.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - pomoSeconds / POMO_DURATIONS[pomoMode]));
  arc.style.stroke = pomoMode === 'focus' ? '#F8C8DC' : '#E6D6FF';
}
function pomoToggle() {
  if (pomoRunning) {
    clearInterval(pomoInterval); pomoRunning = false; setText('pomo-start-btn','Resume');
  } else {
    pomoRunning = true; setText('pomo-start-btn','Pause');
    pomoInterval = setInterval(() => {
      if (pomoSeconds <= 0) {
        playNotificationSound();
        if (pomoMode === 'focus') { tomatoCount++; tomatoDate = todayISO(); saveTomatoCount(); updateTomatoDisplay(); }
        pomoReset(); return;
      }
      pomoSeconds--; updatePomoDisplay();
    }, 1000);
  }
}
function pomoReset() {
  clearInterval(pomoInterval); pomoRunning = false;
  pomoSeconds = POMO_DURATIONS[pomoMode]; setText('pomo-start-btn','Start'); updatePomoDisplay();
}
function pomoSwitch() {
  clearInterval(pomoInterval); pomoRunning = false;
  pomoMode    = pomoMode === 'focus' ? 'break' : 'focus';
  pomoSeconds = POMO_DURATIONS[pomoMode];
  setText('pomo-start-btn','Start');
  setText('pomo-mode-label', pomoMode === 'focus' ? 'Focus session' : 'Short break');
  setText('pomo-switch-btn', pomoMode === 'focus' ? 'Break' : 'Focus');
  updatePomoDisplay();
}
function updateTomatoDisplay() {
  const el = document.getElementById('tomato-counter');
  if (el) el.textContent = '🍅'.repeat(tomatoCount);
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

// ─── Dynamic tabs ─────────────────────────────────────────────────────────────
function renderNavTabs() {
  const nav = document.getElementById('nav-tabs'); if (!nav) return;
  let html = `<button class="tab-btn text-sm font-medium px-4 py-3 text-pink-600" data-tab="overview" onclick="switchTab('overview')">Overview</button>`;
  roles.forEach(role => {
    const key = role.toLowerCase().replace(/\s+/g, '_');
    html += `<button class="tab-btn text-sm font-medium px-4 py-3 text-gray-400" data-tab="${key}" onclick="switchTab('${key}')">${role}</button>`;
  });
  html += `<button class="tab-btn text-sm font-medium px-4 py-3 text-gray-400" data-tab="all" onclick="switchTab('all')">All tasks</button>`;
  nav.innerHTML = html;
  nav.querySelectorAll('.tab-btn').forEach(btn => {
    const on = btn.getAttribute('data-tab') === activeTab;
    btn.classList.toggle('active', on); btn.classList.toggle('text-pink-600', on); btn.classList.toggle('text-gray-400', !on);
  });
}
function renderRoleTabs() {
  const container = document.getElementById('role-tabs-container'); if (!container) return;
  container.innerHTML = roles.map(role => {
    const key = role.toLowerCase().replace(/\s+/g, '_');
    return `
      <div id="tab-${key}" class="tab-content hidden fade-in">
        <div class="flex gap-2 mb-4 flex-wrap">
          <button class="date-filter-badge active" onclick="setDateFilter('${key}','all')"   data-filter="all">All</button>
          <button class="date-filter-badge"        onclick="setDateFilter('${key}','today')" data-filter="today">Today</button>
          <button class="date-filter-badge"        onclick="setDateFilter('${key}','week')"  data-filter="week">This week</button>
          <button class="date-filter-badge"        onclick="setDateFilter('${key}','month')" data-filter="month">This month</button>
        </div>
        <div id="kanban-${key}" class="kanban-board"></div>
      </div>`;
  }).join('');
}

// ─── Settings modal ───────────────────────────────────────────────────────────
function renderSettingsModal() {
  const editor = document.getElementById('roles-editor'); if (!editor) return;
  let html = roles.map((role, i) => {
    const currentColorId = roleColorMap[role] || DEFAULT_COLOR_ID;
    const swatches = ROLE_COLORS.map(c => {
      const sel = currentColorId === c.id;
      return `<button onclick="setRoleColor('${role}','${c.id}')" title="${c.id}" style="width:26px;height:26px;border-radius:50%;background:${c.bg};border:${sel?`3px solid ${c.text}`:`2px solid ${c.border}`};cursor:pointer;box-shadow:${sel?`0 0 0 2px white,0 0 0 4px ${c.border}`:'none'};transition:transform 0.15s;flex-shrink:0;" onmouseover="this.style.transform='scale(1.18)'" onmouseout="this.style.transform='scale(1)'"></button>`;
    }).join('');
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
  }).join('');
  if (roles.length < 4) html += `<button onclick="addRole()" style="width:100%;padding:0.75rem;background:#E6D6FF;border:2px solid #A888E0;border-radius:0.75rem;color:#6040A0;font-weight:600;cursor:pointer;margin-top:0.5rem;font-family:'DM Sans',sans-serif;">+ Add Role</button>`;
  editor.innerHTML = html;
}
function setRoleColor(roleName, colorId) {
  roleColorMap[roleName] = colorId; saveToFirestore(); renderSettingsModal(); render(); updateCalendarEvents();
}
function updateRole(index, newName) {
  if (!newName.trim()) return;
  const oldName = roles[index]; roles[index] = newName.trim();
  if (roleColorMap[oldName]) { roleColorMap[newName.trim()] = roleColorMap[oldName]; delete roleColorMap[oldName]; }
  saveToFirestore(); renderNavTabs(); renderRoleTabs(); render();
}
function deleteRole(index) {
  if (roles.length <= 1 || !confirm(`Delete role "${roles[index]}"?`)) return;
  const deletedKey = roles[index].toLowerCase().replace(/\s+/g, '_');
  roles.splice(index, 1);
  if (activeTab === deletedKey) activeTab = 'overview';
  dateFilters = { all: 'all' };
  roles.forEach(r => { dateFilters[r.toLowerCase().replace(/\s+/g, '_')] = 'all'; });
  saveToFirestore(); renderNavTabs(); renderRoleTabs(); render(); renderSettingsModal();
}
function addRole() {
  if (roles.length >= 4) return;
  const newRole = prompt('Enter new role name (max 15 characters):');
  if (newRole && newRole.trim()) {
    const trimmed = newRole.trim().substring(0, 15);
    roles.push(trimmed);
    roles.forEach((r, i) => { if (!roleColorMap[r]) roleColorMap[r] = ROLE_COLORS[i % ROLE_COLORS.length].id; });
    dateFilters[trimmed.toLowerCase().replace(/\s+/g, '_')] = 'all';
    saveToFirestore(); renderNavTabs(); renderRoleTabs(); render(); renderSettingsModal();
  }
}
function openSettingsModal() {
  const modal = document.getElementById('settings-modal-overlay');
  if (modal) { renderSettingsModal(); modal.classList.add('active'); }
}
function closeSettingsModal(e) {
  if (e && e.target.id !== 'settings-modal-overlay') return;
  document.getElementById('settings-modal-overlay')?.classList.remove('active');
}

// ─── Calendar ─────────────────────────────────────────────────────────────────
function getPriorityEventClass(priority) {
  return { High:'event-high', Medium:'event-medium', Low:'event-low' }[priority] || '';
}
function getCalendarEvents() {
  return tasks.filter(t => t.due).map(t => {
    const roleOrder = roles.indexOf(t.role);
    return {
      id: `task-${t.id}`, title: t.title, start: t.due, end: t.due,
      order: roleOrder === -1 ? 999 : roleOrder,
      extendedProps: {
        taskId: t.id, role: t.role, priority: t.priority, status: t.status, done: t.done,
        eventBg: getRoleColor(t.role).eventBg, eventBorder: getRoleColor(t.role).eventBorder, eventText: getRoleColor(t.role).text,
      },
      classNames: [getPriorityEventClass(t.priority)],
      display: 'block',
    };
  });
}
function initCalendar() {
  const calendarEl = document.getElementById('calendar'); if (!calendarEl) return;
  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    headerToolbar: { left:'prev,next today', center:'title', right:'dayGridMonth,dayGridWeek' },
    eventOrder: 'order,start,title',
    editable: true, eventDurationEditable: false,
    height: 'auto', contentHeight: 'auto',
    events: getCalendarEvents(),
    eventDrop: function(info) {
      const task = tasks.find(t => t.id === info.event.extendedProps.taskId);
      if (!task) { info.revert(); return; }
      const d = info.event.start;
      task.due = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      saveData();
      if (activeTab === 'overview') { renderMetrics(); renderToday(); renderUrgent(); }
    },
    eventDidMount: function(info) {
      const props = info.event.extendedProps;
      if (props.done) {
        info.el.style.setProperty('background-color','#F5F5F5','important');
        info.el.style.setProperty('border-color','#DDDDDD','important');
        info.el.style.setProperty('opacity','0.65','important');
        const title = info.el.querySelector('.fc-event-title');
        if (title) { title.style.setProperty('text-decoration','line-through','important'); title.style.setProperty('color','#AAAAAA','important'); }
      } else {
        info.el.style.setProperty('background-color', props.eventBg,     'important');
        info.el.style.setProperty('border-color',     props.eventBorder, 'important');
        info.el.style.setProperty('color',            props.eventText,   'important');
      }
      const inner = info.el.querySelector('.fc-event-main');
      if (inner) inner.style.setProperty('color', props.done ? '#AAAAAA' : props.eventText, 'important');
    },
    eventClick: function(info) {
      const task = tasks.find(t => t.id === info.event.extendedProps.taskId);
      if (task) showTaskDetail(task);
    },
    eventMouseEnter: function(info) {
      const task = tasks.find(t => t.id === info.event.extendedProps.taskId);
      if (task) info.el.title = `${task.role} · ${task.priority} · ${task.status}`;
    },
    dayCellDidMount: function(info) {
      const dayTasks = tasks.filter(t => t.due === info.dateStr && !t.done);
      if (dayTasks.length > 0) info.el.style.backgroundColor = 'rgba(240,160,192,0.05)';
    },
  });
  calendar.render();
}
function updateCalendarEvents() {
  if (!calendar) return;
  calendar.removeAllEvents(); calendar.addEventSource(getCalendarEvents());
}

function showTaskDetail(task) {
  const modal = document.getElementById('task-modal-overlay'); if (!modal) return;
  window.currentModalTask = task;
  setText('modal-task-title', task.title);
  const sEl = document.getElementById('modal-status-pill');
  const pEl = document.getElementById('modal-priority-pill');
  const rEl = document.getElementById('modal-role-pill');
  const dEl = document.getElementById('modal-due-date');
  if (sEl) sEl.innerHTML = statusPill(task.status);
  if (pEl) pEl.innerHTML = priPill(task.priority);
  if (rEl) rEl.innerHTML = rolePill(task.role);
  if (dEl) dEl.textContent = task.due ? formatDate(task.due) : 'No due date';
  modal.classList.add('active');
}
function closeTaskModal(e) {
  if (e && e.target.id !== 'task-modal-overlay') return;
  document.getElementById('task-modal-overlay')?.classList.remove('active');
  window.currentModalTask = null;
}
function markTaskDone() {
  const task = window.currentModalTask;
  if (task) { task.done = true; task.status = 'Done'; saveData(); render(); closeTaskModal(); }
}
function deleteCurrentTask() {
  const task = window.currentModalTask;
  if (task && confirm(`Delete "${task.title}"?`)) { deleteTask(task.id); closeTaskModal(); }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(function init() {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      updateUserDisplay(user);
      showAppScreen();

      const todayEl = document.getElementById('today-label');
      if (todayEl) todayEl.textContent = new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });

      await loadFromFirestore();
      renderNavTabs();
      renderRoleTabs();
      updateRoleSelect();
      render();
      updatePomoDisplay();
      updateTomatoDisplay();
      setTimeout(() => { initCalendar(); }, 100);

      const notepad = document.getElementById('notepad');
      if (notepad) {
        let noteTimer = 0;
        notepad.addEventListener('input', () => { clearTimeout(noteTimer); noteTimer = setTimeout(saveNote, 800); });
      }
    } else {
      currentUser = null;
      showLoginScreen();
    }
  });
})();