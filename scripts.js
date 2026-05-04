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
 * @property {string}   due       - ISO date string (YYYY-MM-DD) or ''
 * @property {boolean}  done
 */

// ─── Constants ─────────────────────────────────────────────────────────────
const STORAGE_KEY    = 'moondb_tasks_v1';
const NOTE_KEY       = 'moondb_note_v1';
const POMO_KEY       = 'moondb_pomo_v1';
const ROLES_KEY      = 'moondb_roles_v1';
const ROLES_COLORS_KEY = 'moondb_role_colors_v1';
const POMO_DURATIONS = { focus: 25 * 60, break: 5 * 60 };
const CIRCUMFERENCE  = 2 * Math.PI * 40;
const STATUSES       = ['In Progress', 'Backlog', 'Blocked', 'Done'];
const DEFAULT_ROLES  = ['QA', 'Marketing', 'Finance'];
const DEFAULT_COLOR_ID = 'rose';

/** 7 pastel swatches — { id, bg, border, text, eventBg, eventBorder } */
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

// ─── State ─────────────────────────────────────────────────────────────────
/** @type {Task[]} */        let tasks       = [];
let nextId      = 200;
let activeTab   = 'overview';
/** @type {string[]} */      let roles       = [...DEFAULT_ROLES];
/** @type {Record<string,string>} — role name → color id */
let roleColorMap = {};
let dateFilters  = {};
let draggedTask  = null;
let calendar     = null;

// Pomodoro
let pomoMode    = /** @type {'focus'|'break'} */ ('focus');
let pomoRunning = false;
let pomoSeconds = POMO_DURATIONS.focus;
/** @type {number|null} */ let pomoInterval = null;
let tomatoCount = 0;
let tomatoDate  = todayISO();

let quickTitle = '';

// ─── Helpers ───────────────────────────────────────────────────────────────
/** @returns {string} */
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/** @param {number} days @returns {string} */
function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/** @param {string} iso @returns {string} */
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

/** @param {Task} t @returns {boolean} */
function isUrgent(t) {
  if (t.done) return false;
  if (!t.due) return t.priority === 'High';
  return t.due <= todayISO();
}

/** @param {number} s @returns {string} */
function fmtSeconds(s) {
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

/**
 * @param {Task} t
 * @param {string} filter
 * @returns {boolean}
 */
function matchesDateFilter(t, filter) {
  if (filter === 'all' || !t.due) return true;
  const today = new Date(todayISO());
  const due   = new Date(t.due);
  if (filter === 'today') return t.due === todayISO();
  if (filter === 'week')  { const e = new Date(today); e.setDate(today.getDate() + 7);  return due >= today && due <= e; }
  if (filter === 'month') { const e = new Date(today); e.setMonth(today.getMonth() + 1); return due >= today && due <= e; }
  return true;
}

// ─── Color helpers ──────────────────────────────────────────────────────────
/**
 * @param {string} role
 * @returns {typeof ROLE_COLORS[0]}
 */
function getRoleColor(role) {
  const colorId = roleColorMap[role] || DEFAULT_COLOR_ID;
  return ROLE_COLORS.find(c => c.id === colorId) || ROLE_COLORS[0];
}

// ─── Pill helpers ───────────────────────────────────────────────────────────
/** @param {string} r @returns {string} */
function rolePill(r) {
  const c = getRoleColor(r);
  return `<span class="pill text-[11px] font-medium px-2 py-0.5 rounded-full"
    style="background:${c.bg}; color:${c.text}; border:1px solid ${c.border};">${r}</span>`;
}

/** @param {string} p @returns {string} */
function priPill(p) {
  const map = { High:'bg-red-100 text-red-500', Medium:'bg-amber-100 text-amber-600', Low:'bg-green-100 text-green-600' };
  return `<span class="pill text-[11px] font-medium px-2 py-0.5 rounded-full ${map[p] || ''}">${p}</span>`;
}

/** @param {string} s @returns {string} */
function statusPill(s) {
  const map = { 'In Progress':'bg-blue-100 text-blue-500', 'Blocked':'bg-red-100 text-red-400', 'Done':'bg-gray-100 text-gray-400', 'Backlog':'bg-gray-50 text-gray-300' };
  return `<span class="pill text-[11px] font-medium px-2 py-0.5 rounded-full ${map[s] || ''}">${s}</span>`;
}

// ─── Persistence ────────────────────────────────────────────────────────────
function loadRoles() {
  try {
    const saved = localStorage.getItem(ROLES_KEY);
    roles = saved ? JSON.parse(saved).slice(0, 4) : [...DEFAULT_ROLES];
  } catch (_) { roles = [...DEFAULT_ROLES]; }

  try {
    const savedColors = localStorage.getItem(ROLES_COLORS_KEY);
    roleColorMap = savedColors ? JSON.parse(savedColors) : {};
  } catch (_) { roleColorMap = {}; }

  // Assign a default color to any role that doesn't have one yet
  roles.forEach((r, i) => {
    if (!roleColorMap[r]) roleColorMap[r] = ROLE_COLORS[i % ROLE_COLORS.length].id;
  });

  // Reset date filters
  dateFilters = { all: 'all' };
  roles.forEach(r => { dateFilters[r.toLowerCase().replace(/\s+/g, '_')] = 'all'; });
}

function saveRoles() {
  try { localStorage.setItem(ROLES_KEY, JSON.stringify(roles.slice(0, 4))); } catch (_) {}
}

function saveRoleColors() {
  try { localStorage.setItem(ROLES_COLORS_KEY, JSON.stringify(roleColorMap)); } catch (_) {}
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { const d = JSON.parse(raw); tasks = d.tasks || [...SAMPLE_TASKS]; nextId = d.nextId || 200; }
    else { tasks = [...SAMPLE_TASKS]; nextId = 200; }
  } catch (_) { tasks = [...SAMPLE_TASKS]; nextId = 200; }

  const noteEl = document.getElementById('notepad');
  if (noteEl) noteEl.value = localStorage.getItem(NOTE_KEY) || '';

  try {
    const pomoData = localStorage.getItem(POMO_KEY);
    if (pomoData) {
      const p = JSON.parse(pomoData);
      const t = todayISO();
      tomatoCount = p.date === t ? (p.count || 0) : 0;
      tomatoDate  = t;
    } else { tomatoCount = 0; tomatoDate = todayISO(); }
  } catch (_) { tomatoCount = 0; tomatoDate = todayISO(); }
}

function saveData() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks, nextId })); } catch (_) {}
  if (activeTab === 'overview') updateCalendarEvents();
}

function saveTomatoCount() {
  try { localStorage.setItem(POMO_KEY, JSON.stringify({ count: tomatoCount, date: tomatoDate })); } catch (_) {}
}

function updateTomatoDisplay() {
  const el = document.getElementById('tomato-counter');
  if (el) el.textContent = '🍅'.repeat(tomatoCount);
}

function saveNote() {
  const el = /** @type {HTMLTextAreaElement} */ (document.getElementById('notepad'));
  try { localStorage.setItem(NOTE_KEY, el.value); } catch (_) {}
  const saved = document.getElementById('note-saved');
  if (saved) { saved.textContent = '✓ saved'; setTimeout(() => { saved.textContent = ''; }, 1500); }
}

// ─── Render: Overview ───────────────────────────────────────────────────────
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
    .sort((a, b) => ['High','Medium','Low'].indexOf(a.priority) - ['High','Medium','Low'].indexOf(b.priority))
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
          <span class="text-gray-300">${rt.filter(t => t.status === 'Backlog').length}</span>
          <span class="text-blue-300">${rt.filter(t => t.status === 'In Progress').length}</span>
          <span class="text-red-300">${rt.filter(t => t.status === 'Blocked').length}</span>
        </div>
      </div>`;
  }).join('');
}

// ─── Render: Kanban ──────────────────────────────────────────────────────────
/**
 * @param {string|null} role   - null = show all roles
 * @param {string}      elId
 * @param {string}      dateFilter
 */
function renderKanban(role, elId, dateFilter) {
  const el = document.getElementById(elId); if (!el) return;
  const filtered = tasks.filter(t =>
    (role === null || t.role === role) && matchesDateFilter(t, dateFilter)
  );
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
          ${statusTasks.length
            ? statusTasks.map(t => taskCardHTML(t, role === null)).join('')
            : '<div class="kanban-empty">Drop tasks here</div>'}
        </div>
      </div>`;
  }
  el.innerHTML = html;
}

/**
 * @param {Task}    t
 * @param {boolean} showRole
 * @returns {string}
 */
function taskCardHTML(t, showRole) {
  const c = getRoleColor(t.role);
  const borderAccent = `border-left: 3px solid ${c.border};`;
  return `
    <div class="task-card" draggable="true" id="card-${t.id}"
      style="${borderAccent}"
      ondragstart="handleDragStart(event, ${t.id})"
      ondragend="handleDragEnd(event)">
      <div class="task-card-title">${t.title}</div>
      <div class="task-card-meta">
        ${showRole ? rolePill(t.role) : ''}
        ${statusPill(t.status)}
        ${priPill(t.priority)}
      </div>
      <div class="task-card-bottom">
        <input type="date" class="task-card-due" value="${t.due || ''}"
          style="padding:0.25rem 0.5rem; border:1px solid #FFD6E7; border-radius:0.375rem; font-size:0.75rem; cursor:pointer;"
          onchange="updateTaskDue(${t.id}, this.value)" />
        <div style="display:flex; gap:0.25rem;">
          <button class="task-card-delete" onclick="duplicateTask(${t.id})" title="Duplicate" style="opacity:0.6;">📋</button>
          <button class="task-card-delete" onclick="deleteTask(${t.id})">×</button>
        </div>
      </div>
    </div>`;
}

/**
 * @param {Task}    t
 * @param {boolean} showDelete
 * @returns {string}
 */
function taskRowHTML(t, showDelete) {
  const overdue = t.due && t.due <= todayISO() && !t.done;
  return `
    <div class="flex items-start gap-3 py-2.5 border-b border-pink-50 last:border-none" id="tr-${t.id}">
      <button onclick="toggleDone(${t.id})"
        class="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition
          ${t.done ? 'bg-lavender-200 border-lavender-300' : 'border-pink-200 hover:border-pink-400'}">
        ${t.done ? '<span class="w-1.5 h-1.5 rounded-full bg-lavender-500 block"></span>' : ''}
      </button>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-gray-700 leading-snug ${t.done ? 'line-through text-gray-300' : ''}">${t.title}</p>
        <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
          ${rolePill(t.role)}
          ${statusPill(t.status)}
          ${priPill(t.priority)}
          ${t.due ? `<span class="text-[11px] font-mono ${overdue && !t.done ? 'text-red-400 font-semibold' : 'text-gray-300'}">${formatDate(t.due)}</span>` : ''}
        </div>
      </div>
      ${showDelete ? `<button class="text-pink-200 hover:text-pink-400 text-base w-5 h-5 flex items-center justify-center rounded-full flex-shrink-0 transition" onclick="deleteTask(${t.id})">×</button>` : ''}
    </div>`;
}

// ─── Drag and drop ───────────────────────────────────────────────────────────
/** @param {DragEvent} e @param {number} taskId */
function handleDragStart(e, taskId) {
  draggedTask = taskId;
  const card = document.getElementById(`card-${taskId}`);
  if (card) card.classList.add('dragging');
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}

/** @param {DragEvent} e */
function handleDragEnd(e) {
  document.querySelectorAll('.kanban-drop-zone').forEach(z => z.classList.remove('drag-over'));
  if (draggedTask) {
    const card = document.getElementById(`card-${draggedTask}`);
    if (card) card.classList.remove('dragging');
  }
}

/** @param {DragEvent} e */
function handleDragOver(e) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const zone = e.currentTarget;
  if (zone) zone.classList.add('drag-over');
}

/** @param {DragEvent} e */
function handleDragLeave(e) {
  const zone = e.currentTarget;
  if (zone && e.target === zone) zone.classList.remove('drag-over');
}

/** @param {DragEvent} e */
function handleDrop(e) {
  e.preventDefault();
  const zone = /** @type {HTMLElement} */ (e.currentTarget);
  zone.classList.remove('drag-over');
  if (!draggedTask) return;
  const newStatus = /** @type {Status} */ (zone.getAttribute('data-status'));
  const task = tasks.find(t => t.id === draggedTask);
  if (task) {
    task.status = newStatus;
    task.done   = newStatus === 'Done';
    if (newStatus !== 'Done' && task.done) task.done = false;
  }
  saveData(); render();
  draggedTask = null;
}

// ─── Actions ────────────────────────────────────────────────────────────────
/** @param {number} id */
function toggleDone(id) {
  const t = tasks.find(x => x.id === id);
  if (t) { t.done = !t.done; t.status = t.done ? 'Done' : 'Backlog'; }
  saveData(); render();
}

/** @param {number} id */
function deleteTask(id) {
  tasks = tasks.filter(x => x.id !== id);
  saveData(); render();
}

/** @param {number} id */
function duplicateTask(id) {
  const orig = tasks.find(x => x.id === id);
  if (!orig) return;
  tasks.unshift({ id: nextId++, title: orig.title, role: orig.role, status: 'Backlog', priority: orig.priority, due: orig.due, done: false });
  saveData(); render();
}

/** @param {number} id @param {string} newDue */
function updateTaskDue(id, newDue) {
  const t = tasks.find(x => x.id === id);
  if (t) { t.due = newDue; saveData(); render(); }
}

function quickAdd() {
  const input = /** @type {HTMLInputElement} */ (document.getElementById('quick-input'));
  quickTitle = input.value.trim();
  if (!quickTitle) return;
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
  const role     = document.getElementById('qf-role').value;
  const priority = document.getElementById('qf-priority').value;
  const status   = document.getElementById('qf-status').value;
  const due      = /** @type {HTMLInputElement} */ (document.getElementById('qf-due')).value;
  tasks.unshift({ id: nextId++, title: quickTitle, role, status, priority, due, done: false });
  saveData(); render(); cancelQuick();
}

/** @param {string} tab @param {string} filter */
function setDateFilter(tab, filter) {
  dateFilters[tab] = filter;
  document.querySelectorAll(`#tab-${tab} .date-filter-badge`).forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
  });
  render();
}

// ─── Tab switching ───────────────────────────────────────────────────────────
/** @param {string} tab */
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

// ─── Full render ─────────────────────────────────────────────────────────────
function render() {
  if (activeTab === 'overview') {
    renderMetrics(); renderToday(); renderUrgent(); renderRoleSnapshot();
    updateCalendarEvents();
  } else if (activeTab === 'all') {
    renderKanban(null, 'kanban-all', dateFilters.all || 'all');
  } else {
    const roleIndex = roles.findIndex(r => r.toLowerCase().replace(/\s+/g, '_') === activeTab);
    if (roleIndex !== -1) {
      const role    = roles[roleIndex];
      const roleKey = role.toLowerCase().replace(/\s+/g, '_');
      renderKanban(role, `kanban-${roleKey}`, dateFilters[roleKey] || 'all');
    }
  }
}

// ─── Pomodoro ────────────────────────────────────────────────────────────────
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 800; osc.type = 'sine';
      const t = now + i * 0.2;
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
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
    clearInterval(pomoInterval); pomoRunning = false; setText('pomo-start-btn', 'Resume');
  } else {
    pomoRunning = true; setText('pomo-start-btn', 'Pause');
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
  pomoSeconds = POMO_DURATIONS[pomoMode];
  setText('pomo-start-btn', 'Start'); updatePomoDisplay();
}

function pomoSwitch() {
  clearInterval(pomoInterval); pomoRunning = false;
  pomoMode    = pomoMode === 'focus' ? 'break' : 'focus';
  pomoSeconds = POMO_DURATIONS[pomoMode];
  setText('pomo-start-btn', 'Start');
  setText('pomo-mode-label', pomoMode === 'focus' ? 'Focus session' : 'Short break');
  setText('pomo-switch-btn', pomoMode === 'focus' ? 'Break' : 'Focus');
  updatePomoDisplay();
}

// ─── Utility ─────────────────────────────────────────────────────────────────
/** @param {string} id @param {string} text */
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
  // Re-highlight active tab
  nav.querySelectorAll('.tab-btn').forEach(btn => {
    const on = btn.getAttribute('data-tab') === activeTab;
    btn.classList.toggle('active', on);
    btn.classList.toggle('text-pink-600', on);
    btn.classList.toggle('text-gray-400', !on);
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
      const isSelected = currentColorId === c.id;
      return `
        <button
          onclick="setRoleColor('${role}', '${c.id}')"
          title="${c.id}"
          style="
            width:26px; height:26px; border-radius:50%;
            background:${c.bg};
            border:${isSelected ? `3px solid ${c.text}` : `2px solid ${c.border}`};
            cursor:pointer;
            box-shadow:${isSelected ? `0 0 0 2px white, 0 0 0 4px ${c.border}` : 'none'};
            transition:transform 0.15s;
            flex-shrink:0;
          "
          onmouseover="this.style.transform='scale(1.18)'"
          onmouseout="this.style.transform='scale(1)'"
        ></button>`;
    }).join('');

    return `
      <div style="display:flex; flex-direction:column; gap:0.5rem; padding:0.75rem; background:#FFF8FB; border:1px solid #FFD6E7; border-radius:1rem;">
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <input type="text" value="${role}" maxlength="15"
            onchange="updateRole(${i}, this.value)"
            style="flex:1; padding:0.5rem 0.75rem; border:1px solid #FFD6E7; border-radius:0.5rem; font-size:0.875rem; font-family:'DM Sans',sans-serif; outline:none;">
          <button onclick="deleteRole(${i})"
            style="padding:0.5rem 0.75rem; background:#FFE0E8; border:none; border-radius:0.5rem; color:#C05070; cursor:pointer; font-weight:500; font-size:0.8rem; font-family:'DM Sans',sans-serif;">
            Delete
          </button>
        </div>
        <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
          <span style="font-size:0.68rem; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:#F0A0C0; white-space:nowrap; flex-shrink:0;">Color</span>
          <div style="display:flex; gap:0.35rem; flex-wrap:wrap; align-items:center;">${swatches}</div>
        </div>
      </div>`;
  }).join('');

  if (roles.length < 4) {
    html += `
      <button onclick="addRole()"
        style="width:100%; padding:0.75rem; background:#E6D6FF; border:2px solid #A888E0; border-radius:0.75rem; color:#6040A0; font-weight:600; cursor:pointer; margin-top:0.5rem; font-family:'DM Sans',sans-serif;">
        + Add Role
      </button>`;
  }

  editor.innerHTML = html;
}

/** @param {string} roleName @param {string} colorId */
function setRoleColor(roleName, colorId) {
  roleColorMap[roleName] = colorId;
  saveRoleColors();
  renderSettingsModal();   // refresh swatch selected states
  render();                // refresh pills + kanban cards
  updateCalendarEvents();  // always refresh calendar — color may have changed while on any tab
}

/** @param {number} index @param {string} newName */
function updateRole(index, newName) {
  if (!newName.trim()) return;
  const oldName = roles[index];
  roles[index]  = newName.trim();
  if (roleColorMap[oldName]) {
    roleColorMap[newName.trim()] = roleColorMap[oldName];
    delete roleColorMap[oldName];
    saveRoleColors();
  }
  saveRoles(); renderNavTabs(); renderRoleTabs(); render();
}

/** @param {number} index */
function deleteRole(index) {
  if (roles.length <= 1 || !confirm(`Delete role "${roles[index]}"?`)) return;
  const deletedKey = roles[index].toLowerCase().replace(/\s+/g, '_');
  roles.splice(index, 1);
  saveRoles(); loadRoles();
  if (activeTab === deletedKey) activeTab = 'overview';
  renderNavTabs(); renderRoleTabs(); render(); renderSettingsModal();
}

function addRole() {
  if (roles.length >= 4) return;
  const newRole = prompt('Enter new role name (max 15 characters):');
  if (newRole && newRole.trim()) {
    const trimmed = newRole.trim().substring(0, 15);
    roles.push(trimmed);
    saveRoles(); loadRoles();
    renderNavTabs(); renderRoleTabs(); render(); renderSettingsModal();
  }
}

function openSettingsModal() {
  const modal = document.getElementById('settings-modal-overlay');
  if (modal) { renderSettingsModal(); modal.classList.add('active'); }
}

/** @param {Event} [e] */
function closeSettingsModal(e) {
  if (e && e.target.id !== 'settings-modal-overlay') return;
  document.getElementById('settings-modal-overlay')?.classList.remove('active');
}

// ─── Calendar ─────────────────────────────────────────────────────────────────
/** @param {string} priority @returns {string} */
function getPriorityEventClass(priority) {
  return { High: 'event-high', Medium: 'event-medium', Low: 'event-low' }[priority] || '';
}

/** @returns {Object[]} */
function getCalendarEvents() {
  return tasks.filter(t => t.due).map(t => {
    // Use role index so events stack in the same order as the nav tabs
    const roleOrder = roles.indexOf(t.role);
    return {
      id:    `task-${t.id}`,
      title: t.title,
      start: t.due,
      end:   t.due,
      // order = primary sort key within a day cell (lower index = higher up)
      order: roleOrder === -1 ? 999 : roleOrder,
      extendedProps: {
        taskId:      t.id,
        role:        t.role,
        priority:    t.priority,
        status:      t.status,
        done:        t.done,
        eventBg:     getRoleColor(t.role).eventBg,
        eventBorder: getRoleColor(t.role).eventBorder,
        eventText:   getRoleColor(t.role).text,
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
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek' },
    eventOrder: 'order,start,title',  // group by role order, then by date, then alphabetically
    editable: true,            // enables drag-and-drop on all events
    droptable: true,          // allows dropping onto day cells
    eventDurationEditable: false, // don't allow resizing (we only want date change, not duration)

    // ── Fired when user drops an event onto a new date ──
    eventDrop: function(info) {
      const taskId = info.event.extendedProps.taskId;
      const task   = tasks.find(t => t.id === taskId);
      if (!task) { info.revert(); return; }

      // FullCalendar gives us the new date as a Date object — convert to ISO string
      // Use local date parts instead of toISOString() which converts to UTC
      // and shifts the date back by a day for UTC+ timezones (e.g. Philippines UTC+8)
      const d = info.event.start;
      const newDue = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      task.due = newDue;
      saveData();
      // Refresh snapshot + urgent on overview without destroying the calendar
      if (activeTab === 'overview') {
        renderMetrics();
        renderToday();
        renderUrgent();
      }
    },
    height: 'auto',
    contentHeight: 'auto',
    events: getCalendarEvents(),

    // ── KEY FIX: force role colors via inline styles after each event mounts ──
    eventDidMount: function(info) {
      const props = info.event.extendedProps;

      if (props.done) {
        // Done tasks: muted background, strikethrough title, reduced opacity
        info.el.style.setProperty('background-color', '#F5F5F5', 'important');
        info.el.style.setProperty('border-color',     '#DDDDDD', 'important');
        info.el.style.setProperty('color',            '#AAAAAA', 'important');
        info.el.style.setProperty('opacity',          '0.65',    'important');
        const title = info.el.querySelector('.fc-event-title');
        if (title) {
          title.style.setProperty('text-decoration', 'line-through', 'important');
          title.style.setProperty('color',           '#AAAAAA',      'important');
        }
      } else {
        // Active tasks: full role color
        info.el.style.setProperty('background-color', props.eventBg,     'important');
        info.el.style.setProperty('border-color',     props.eventBorder, 'important');
        info.el.style.setProperty('color',            props.eventText,   'important');
      }

      // Apply text color to the inner fc-event-main div too
      const inner = info.el.querySelector('.fc-event-main');
      if (inner) {
        inner.style.setProperty('color', props.done ? '#AAAAAA' : props.eventText, 'important');
      }
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
  calendar.removeAllEvents();
  calendar.addEventSource(getCalendarEvents());
}

/** @param {Task} task */
function showTaskDetail(task) {
  const modal = document.getElementById('task-modal-overlay'); if (!modal) return;
  window.currentModalTask = task;
  setText('modal-task-title', task.title);
  const statusEl   = document.getElementById('modal-status-pill');
  const priorityEl = document.getElementById('modal-priority-pill');
  const roleEl     = document.getElementById('modal-role-pill');
  const dueEl      = document.getElementById('modal-due-date');
  if (statusEl)   statusEl.innerHTML   = statusPill(task.status);
  if (priorityEl) priorityEl.innerHTML = priPill(task.priority);
  if (roleEl)     roleEl.innerHTML     = rolePill(task.role);
  if (dueEl)      dueEl.textContent    = task.due ? formatDate(task.due) : 'No due date';
  modal.classList.add('active');
}

/** @param {Event} [e] */
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
  const todayEl = document.getElementById('today-label');
  if (todayEl) todayEl.textContent = new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });

  loadRoles();
  renderNavTabs();
  renderRoleTabs();
  updateRoleSelect();
  loadData();
  render();
  updatePomoDisplay();
  updateTomatoDisplay();

  setTimeout(() => { initCalendar(); }, 100);

  const notepad = document.getElementById('notepad');
  if (notepad) {
    let noteTimer = 0;
    notepad.addEventListener('input', () => { clearTimeout(noteTimer); noteTimer = setTimeout(saveNote, 800); });
  }
})();
