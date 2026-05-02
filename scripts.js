
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
  const STORAGE_KEY = 'moondb_tasks_v1';
  const NOTE_KEY    = 'moondb_note_v1';
  const POMO_KEY    = 'moondb_pomo_v1';
  const ROLES_KEY   = 'moondb_roles_v1';
  const POMO_DURATIONS = { focus: 25 * 60, break: 5 * 60 };
  const CIRCUMFERENCE = 2 * Math.PI * 40; // r=40
  const STATUSES = ['In Progress', 'Backlog', 'Blocked', 'Done'];
  const DEFAULT_ROLES = ['QA', 'Marketing', 'Finance'];

  /** @type {Task[]} */
  const SAMPLE_TASKS = [
    { id:1, title:'Write regression test cases for login flow',   role:'QA',        status:'In Progress', priority:'High',   due: todayISO(),              done: false },
    { id:2, title:'Review API error handling coverage',           role:'QA',        status:'Backlog',     priority:'Medium', due: offsetDate(2),           done: false },
    { id:3, title:'Draft Q2 social media calendar',               role:'Marketing', status:'In Progress', priority:'High',   due: offsetDate(1),           done: false },
    { id:4, title:'Update email newsletter template',             role:'Marketing', status:'Blocked',     priority:'Medium', due: offsetDate(3),           done: false },
    { id:5, title:'Reconcile April expense report',               role:'Finance',   status:'In Progress', priority:'High',   due: todayISO(),              done: false },
    { id:6, title:'Prepare invoice batch for freelance clients',  role:'Finance',   status:'Backlog',     priority:'Medium', due: offsetDate(5),           done: false },
  ];

  // ─── State ─────────────────────────────────────────────────────────────────
  /** @type {Task[]} */ let tasks = [];
  let nextId = 200;
  let activeTab = 'overview';
  /** @type {string[]} */ let roles = [...DEFAULT_ROLES];
  let dateFilters = {};
  let draggedTask = null;
  let calendar = null;

  // Pomodoro state
  let pomoMode    = /** @type {'focus'|'break'} */ ('focus');
  let pomoRunning = false;
  let pomoSeconds = POMO_DURATIONS.focus;
  /** @type {number|null} */ let pomoInterval = null;
  let tomatoCount = 0;
  let tomatoDate = todayISO();

  // Quick-add temp title
  let quickTitle = '';

  // ─── Helpers ───────────────────────────────────────────────────────────────
  /** @returns {string} */
  function todayISO() {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * @param {number} days
   * @returns {string}
   */
  function offsetDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  /**
   * @param {string} iso
   * @returns {string}
   */
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

  /**
   * @param {Task} t
   * @returns {boolean}
   */
  function isUrgent(t) {
    if (t.done) return false;
    if (!t.due) return t.priority === 'High';
    return t.due <= todayISO();
  }

  /** @param {number} s @returns {string} */
  function fmtSeconds(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  /**
   * Check if task falls within date range
   * @param {Task} t
   * @param {string} filter - 'all', 'today', 'week', 'month'
   * @returns {boolean}
   */
  function matchesDateFilter(t, filter) {
    if (filter === 'all' || !t.due) return true;
    const today = new Date(todayISO());
    const due = new Date(t.due);
    
    if (filter === 'today') {
      return t.due === todayISO();
    }
    if (filter === 'week') {
      const weekEnd = new Date(today);
      weekEnd.setDate(today.getDate() + 7);
      return due >= today && due <= weekEnd;
    }
    if (filter === 'month') {
      const monthEnd = new Date(today);
      monthEnd.setMonth(today.getMonth() + 1);
      return due >= today && due <= monthEnd;
    }
    return true;
  }

  // ─── Pill helpers ──────────────────────────────────────────────────────────
  /** @param {Role} r @returns {string} */
  function rolePill(r) {
    const map = {
      QA:        'bg-lavender-200 text-lavender-600',
      Marketing: 'bg-pink-200 text-pink-600',
      Finance:   'bg-sage-100 text-sage-500',
    };
    return `<span class="pill text-[11px] font-medium px-2 py-0.5 rounded-full ${map[r] || ''}">${r}</span>`;
  }

  /** @param {Priority} p @returns {string} */
  function priPill(p) {
    const map = {
      High:   'bg-red-100 text-red-500',
      Medium: 'bg-amber-100 text-amber-600',
      Low:    'bg-green-100 text-green-600',
    };
    return `<span class="pill text-[11px] font-medium px-2 py-0.5 rounded-full ${map[p] || ''}">${p}</span>`;
  }

  /** @param {Status} s @returns {string} */
  function statusPill(s) {
    const map = {
      'In Progress': 'bg-blue-100 text-blue-500',
      'Blocked':     'bg-red-100 text-red-400',
      'Done':        'bg-gray-100 text-gray-400',
      'Backlog':     'bg-gray-50 text-gray-300',
    };
    return `<span class="pill text-[11px] font-medium px-2 py-0.5 rounded-full ${map[s] || ''}">${s}</span>`;
  }

  // ─── Persistence ───────────────────────────────────────────────────────────
  function loadRoles() {
    try {
      const saved = localStorage.getItem(ROLES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        roles = parsed.slice(0, 4); // Max 4 roles
      } else {
        roles = [...DEFAULT_ROLES];
      }
    } catch (_) {
      roles = [...DEFAULT_ROLES];
    }
    // Reinitialize dateFilters with roles
    dateFilters = {};
    roles.forEach(r => {
      const key = r.toLowerCase().replace(/\s+/g, '_');
      dateFilters[key] = 'all';
    });
    dateFilters['all'] = 'all';
  }

  function saveRoles() {
    try { localStorage.setItem(ROLES_KEY, JSON.stringify(roles.slice(0, 4))); } catch (_) {}
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        tasks  = parsed.tasks  || [...SAMPLE_TASKS];
        nextId = parsed.nextId || 200;
      } else {
        tasks  = [...SAMPLE_TASKS];
        nextId = 200;
      }
    } catch (_) {
      tasks  = [...SAMPLE_TASKS];
      nextId = 200;
    }
    const note = localStorage.getItem(NOTE_KEY) || '';
    const el = document.getElementById('notepad');
    if (el) el.value = note;

    // Load tomato counter
    try {
      const pomoData = localStorage.getItem(POMO_KEY);
      if (pomoData) {
        const parsed = JSON.parse(pomoData);
        const today = todayISO();
        if (parsed.date === today) {
          tomatoCount = parsed.count || 0;
          tomatoDate = today;
        } else {
          tomatoCount = 0;
          tomatoDate = today;
        }
      } else {
        tomatoCount = 0;
        tomatoDate = todayISO();
      }
    } catch (_) {
      tomatoCount = 0;
      tomatoDate = todayISO();
    }
  }

  function saveData() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks, nextId })); } catch (_) {}
    if (activeTab === 'overview') updateCalendarEvents();
  }

  function saveTomatoCount() {
    try { localStorage.setItem(POMO_KEY, JSON.stringify({ count: tomatoCount, date: tomatoDate })); } catch (_) {}
  }

  function updateTomatoDisplay() {
    const counter = document.getElementById('tomato-counter');
    if (counter) {
      counter.textContent = '🍅'.repeat(tomatoCount);
    }
  }

  function saveNote() {
    const el = /** @type {HTMLTextAreaElement} */ (document.getElementById('notepad'));
    try { localStorage.setItem(NOTE_KEY, el.value); } catch (_) {}
    const saved = document.getElementById('note-saved');
    if (saved) { saved.textContent = '✓ saved'; setTimeout(() => { saved.textContent = ''; }, 1500); }
  }

  // ─── Render: Overview ──────────────────────────────────────────────────────
  function renderMetrics() {
    const active = tasks.filter(t => !t.done);
    setText('m-total',      String(active.length));
    setText('m-inprogress', String(active.filter(t => t.status === 'In Progress').length));
    setText('m-blocked',    String(active.filter(t => t.status === 'Blocked').length));
  }

  function renderToday() {
    const el = document.getElementById('today-list');
    if (!el) return;
    const top = tasks
      .filter(t => !t.done && (t.priority === 'High' || t.due === todayISO()))
      .sort((a, b) => ['High','Medium','Low'].indexOf(a.priority) - ['High','Medium','Low'].indexOf(b.priority))
      .slice(0, 5);
    if (!top.length) {
      el.innerHTML = `<p class="text-sm text-pink-200 text-center py-4">All clear — nothing urgent today!</p>`;
      return;
    }
    el.innerHTML = top.map(t => taskRowHTML(t, false)).join('');
  }

  function renderUrgent() {
    const el = document.getElementById('urgent-list');
    if (!el) return;
    const urg = tasks.filter(isUrgent).slice(0, 4);
    if (!urg.length) {
      el.innerHTML = `<p class="text-xs text-pink-200 text-center py-2">Nothing urgent!</p>`;
      return;
    }
    el.innerHTML = urg.map(t => `
      <div class="flex items-start gap-2 p-2 rounded-xl bg-pink-50 border border-pink-100 mb-2 last:mb-0">
        <span class="mt-1 w-1.5 h-1.5 rounded-full bg-pink-400 flex-shrink-0"></span>
        <div>
          <p class="text-xs font-medium text-pink-700 leading-snug">${t.title}</p>
          <p class="text-[10px] text-pink-400 mt-0.5">${t.role} · ${t.due ? formatDate(t.due) : t.priority}</p>
        </div>
      </div>`).join('');
  }

  function renderRoleSnapshot() {
    const el = document.getElementById('role-snapshot');
    if (!el) return;
    el.innerHTML = roles.map(r => {
      const rt = tasks.filter(t => t.role === r && !t.done);
      const pending = rt.filter(t => t.status === 'Backlog').length;
      const inp     = rt.filter(t => t.status === 'In Progress').length;
      const blk     = rt.filter(t => t.status === 'Blocked').length;
      return `
        <div class="flex items-center justify-between py-2 border-b border-pink-50 last:border-none">
          <span class="text-sm font-medium text-gray-600 w-20">${r}</span>
          <div class="flex items-center gap-3 text-xs font-mono">
            <span class="text-gray-300">${pending}</span>
            <span class="text-blue-300">${inp}</span>
            <span class="text-red-300">${blk}</span>
          </div>
        </div>`;
    }).join('');
  }

  // ─── Render: Kanban board ──────────────────────────────────────────────────
  /**
   * @param {Role} role
   * @param {string} elId
   * @param {string} dateFilter
   */
  function renderKanban(role, elId, dateFilter) {
    const el = document.getElementById(elId);
    if (!el) return;

    const filtered = tasks.filter(t => t.role === role && matchesDateFilter(t, dateFilter));

    let html = '';
    for (const status of STATUSES) {
      const statusTasks = filtered.filter(t => t.status === status);
      html += `
        <div class="kanban-column">
          <div class="kanban-column-header">
            <div class="kanban-column-title">${status}</div>
            <div class="kanban-column-count">${statusTasks.length}</div>
          </div>
          <div class="kanban-drop-zone" data-status="${status}" ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)">
            ${statusTasks.length ? statusTasks.map(t => taskCardHTML(t)).join('') : '<div class="kanban-empty">Drop tasks here</div>'}
          </div>
        </div>`;
    }
    el.innerHTML = html;
  }

  /**
   * @param {Task} t
   * @returns {string}
   */
  function taskCardHTML(t) {
    const overdue = t.due && t.due <= todayISO() && !t.done;
    return `
      <div class="task-card" draggable="true" id="card-${t.id}" ondragstart="handleDragStart(event, ${t.id})" ondragend="handleDragEnd(event)">
        <div class="task-card-title">${t.title}</div>
        <div class="task-card-meta">
          ${statusPill(t.status)}
          ${priPill(t.priority)}
        </div>
        <div class="task-card-bottom">
          <input type="date" class="task-card-due" value="${t.due || ''}" 
            style="padding: 0.25rem 0.5rem; border: 1px solid #FFD6E7; border-radius: 0.375rem; font-size: 0.75rem; cursor: pointer;"
            onchange="updateTaskDue(${t.id}, this.value)" />
          <div style="display: flex; gap: 0.25rem;">
            <button class="task-card-delete" onclick="duplicateTask(${t.id})" title="Duplicate" style="opacity: 0.6;">📋</button>
            <button class="task-card-delete" onclick="deleteTask(${t.id})">×</button>
          </div>
        </div>
      </div>`;
  }

  /**
   * @param {Task} t
   * @param {boolean} showDelete
   * @returns {string}
   */
  function taskRowHTML(t, showDelete) {
    const overdue = t.due && t.due <= todayISO() && !t.done;
    return `
      <div class="flex items-start gap-3 py-2.5 border-b border-pink-50 last:border-none" id="tr-${t.id}">
        <button onclick="toggleDone(${t.id})"
          class="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition
            ${t.done ? 'bg-lavender-200 border-lavender-300' : 'border-pink-200 hover:border-pink-400'}" >
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

  // ─── Drag and drop ─────────────────────────────────────────────────────────
  /**
   * @param {DragEvent} e
   * @param {number} taskId
   */
  function handleDragStart(e, taskId) {
    draggedTask = taskId;
    const card = document.getElementById(`card-${taskId}`);
    if (card) card.classList.add('dragging');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  /** @param {DragEvent} e */
  function handleDragEnd(e) {
    document.querySelectorAll('.kanban-drop-zone').forEach(z => z.classList.remove('drag-over'));
    if (draggedTask && e.dataTransfer) {
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
      if (newStatus === 'Done') task.done = true;
      else if (task.done) task.done = false;
    }
    saveData(); render();
    draggedTask = null;
  }

  // ─── Actions ───────────────────────────────────────────────────────────────
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

  /**
   * Duplicate a task
   * @param {number} id
   */
  function duplicateTask(id) {
    const original = tasks.find(x => x.id === id);
    if (!original) return;
    const duplicate = {
      id: nextId++,
      title: original.title + ' (copy)',
      role: original.role,
      status: 'Backlog',
      priority: original.priority,
      due: original.due,
      done: false,
    };
    tasks.unshift(duplicate);
    saveData(); render();
  }

  /**
   * Update task due date
   * @param {number} id
   * @param {string} newDue
   */
  function updateTaskDue(id, newDue) {
    const t = tasks.find(x => x.id === id);
    if (t) {
      t.due = newDue;
      saveData(); render();
    }
  }

  function quickAdd() {
    const input = /** @type {HTMLInputElement} */ (document.getElementById('quick-input'));
    quickTitle = input.value.trim();
    if (!quickTitle) return;
    updateRoleSelect();
    const form = document.getElementById('quick-form');
    if (form) form.classList.remove('hidden');
    const dueEl = /** @type {HTMLInputElement} */ (document.getElementById('qf-due'));
    if (dueEl) dueEl.value = todayISO();
  }

  /**
   * Update role select options with current roles
   */
  function updateRoleSelect() {
    const select = document.getElementById('qf-role');
    if (!select) return;
    let html = '';
    roles.forEach(role => {
      html += `<option>${role}</option>`;
    });
    select.innerHTML = html;
  }

  function cancelQuick() {
    const form = document.getElementById('quick-form');
    if (form) form.classList.add('hidden');
    const input = /** @type {HTMLInputElement} */ (document.getElementById('quick-input'));
    if (input) input.value = '';
    quickTitle = '';
  }

  function saveQuickTask() {
    const role     = /** @type {Role}     */ (/** @type {HTMLSelectElement} */ (document.getElementById('qf-role')).value);
    const priority = /** @type {Priority} */ (/** @type {HTMLSelectElement} */ (document.getElementById('qf-priority')).value);
    const status   = /** @type {Status}   */ (/** @type {HTMLSelectElement} */ (document.getElementById('qf-status')).value);
    const due      = /** @type {HTMLInputElement} */ (document.getElementById('qf-due')).value;
    /** @type {Task} */
    const task = { id: nextId++, title: quickTitle, role, status, priority, due, done: false };
    tasks.unshift(task);
    saveData(); render(); cancelQuick();
  }

  /**
   * @param {string} tab
   * @param {string} filter
   */
  function setDateFilter(tab, filter) {
    dateFilters[tab] = filter;
    
    // Update button states
    const buttons = document.querySelectorAll(`#tab-${tab} .date-filter-badge`);
    buttons.forEach(btn => {
      const f = btn.getAttribute('data-filter');
      btn.classList.toggle('active', f === filter);
    });
    
    render();
  }

  // ─── Tab switching ─────────────────────────────────────────────────────────
  /** @param {string} tab */
  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const isActive = btn.getAttribute('data-tab') === tab;
      btn.classList.toggle('active', isActive);
      btn.classList.toggle('text-pink-600', isActive);
      btn.classList.toggle('text-gray-400', !isActive);
    });
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(`tab-${tab}`);
    if (target) { target.classList.remove('hidden'); target.classList.add('fade-in'); }
    render();
  }

  // ─── Full render ───────────────────────────────────────────────────────────
  function render() {
    if (activeTab === 'overview') {
      renderMetrics();
      renderToday();
      renderUrgent();
      renderRoleSnapshot();
      updateCalendarEvents();
    } else if (activeTab === 'all') {
      const filtered = tasks.filter(t => matchesDateFilter(t, dateFilters.all));
      const el = document.getElementById('kanban-all');
      if (!el) return;
      let html = '';
      for (const status of STATUSES) {
        const statusTasks = filtered.filter(t => t.status === status);
        html += `
          <div class="kanban-column">
            <div class="kanban-column-header">
              <div class="kanban-column-title">${status}</div>
              <div class="kanban-column-count">${statusTasks.length}</div>
            </div>
            <div class="kanban-drop-zone" data-status="${status}" ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)">
              ${statusTasks.length ? statusTasks.map(t => taskCardHTML(t)).join('') : '<div class="kanban-empty">Drop tasks here</div>'}
            </div>
          </div>`;
      }
      el.innerHTML = html;
    } else {
      // Dynamic role tabs
      const roleIndex = roles.findIndex(r => r.toLowerCase().replace(/\s+/g, '_') === activeTab);
      if (roleIndex !== -1) {
        const role = roles[roleIndex];
        const roleKey = role.toLowerCase().replace(/\s+/g, '_');
        const filterKey = roleKey;
        renderKanban(role, `kanban-${roleKey}`, dateFilters[filterKey] || 'all');
      }
    }
  }

  // ─── Pomodoro ──────────────────────────────────────────────────────────────
  /**
   * Play notification sound for timer completion
   */
  function playNotificationSound() {
    // Create a simple beep sound using Web Audio API
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const now = audioContext.currentTime;
      const duration = 0.5;

      // Create three beeps
      for (let i = 0; i < 3; i++) {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();

        osc.connect(gain);
        gain.connect(audioContext.destination);

        osc.frequency.value = 800;
        osc.type = 'sine';

        const startTime = now + (i * 0.2);
        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        osc.start(startTime);
        osc.stop(startTime + duration);
      }
    } catch (e) {
      // Fallback: use simple alert if Web Audio API fails
      console.log('Pomodoro complete!');
    }
  }

  function updatePomoDisplay() {
    const disp = document.getElementById('pomo-display');
    const arc  = /** @type {SVGCircleElement|null} */ (document.getElementById('pomo-arc'));
    if (!disp || !arc) return;
    const total  = POMO_DURATIONS[pomoMode];
    const ratio  = pomoSeconds / total;
    disp.textContent = fmtSeconds(pomoSeconds);
    arc.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - ratio));
    arc.style.stroke = pomoMode === 'focus' ? '#F8C8DC' : '#E6D6FF';
  }

  function pomoToggle() {
    if (pomoRunning) {
      clearInterval(pomoInterval);
      pomoRunning = false;
      setText('pomo-start-btn', 'Resume');
    } else {
      pomoRunning = true;
      setText('pomo-start-btn', 'Pause');
      pomoInterval = setInterval(() => {
        if (pomoSeconds <= 0) {
          // Timer finished
          playNotificationSound();
          if (pomoMode === 'focus') {
            // Increment tomato counter and save
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
    setText('pomo-start-btn', 'Start');
    updatePomoDisplay();
  }

  function pomoSwitch() {
    clearInterval(pomoInterval);
    pomoRunning = false;
    pomoMode    = pomoMode === 'focus' ? 'break' : 'focus';
    pomoSeconds = POMO_DURATIONS[pomoMode];
    setText('pomo-start-btn', 'Start');
    setText('pomo-mode-label', pomoMode === 'focus' ? 'Focus session' : 'Short break');
    setText('pomo-switch-btn', pomoMode === 'focus' ? 'Break' : 'Focus');
    updatePomoDisplay();
  }

  // ─── Utility ───────────────────────────────────────────────────────────────
  /**
   * @param {string} id
   * @param {string} text
   */
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ─── Calendar ──────────────────────────────────────────────────────────────
  /**
   * Generate dynamic navigation tabs based on roles
   */
  function renderNavTabs() {
    const nav = document.getElementById('nav-tabs');
    if (!nav) return;

    let html = '<button class="tab-btn active text-sm font-medium px-4 py-3 text-pink-600" data-tab="overview" onclick="switchTab(\'overview\')">Overview</button>';
    
    roles.forEach(role => {
      const roleKey = role.toLowerCase().replace(/\s+/g, '_');
      html += `<button class="tab-btn text-sm font-medium px-4 py-3 text-gray-400" data-tab="${roleKey}" onclick="switchTab('${roleKey}')">${role}</button>`;
    });
    
    html += '<button class="tab-btn text-sm font-medium px-4 py-3 text-gray-400" data-tab="all" onclick="switchTab(\'all\')">All tasks</button>';
    
    nav.innerHTML = html;
  }

  /**
   * Generate dynamic role tab HTML
   */
  function renderRoleTabs() {
    const container = document.getElementById('role-tabs-container');
    if (!container) return;

    let html = '';
    roles.forEach(role => {
      const roleKey = role.toLowerCase().replace(/\s+/g, '_');
      html += `
        <div id="tab-${roleKey}" class="tab-content hidden fade-in">
          <div class="flex gap-2 mb-4 flex-wrap">
            <button class="date-filter-badge active" onclick="setDateFilter('${roleKey}', 'all')" data-filter="all">All</button>
            <button class="date-filter-badge" onclick="setDateFilter('${roleKey}', 'today')" data-filter="today">Today</button>
            <button class="date-filter-badge" onclick="setDateFilter('${roleKey}', 'week')" data-filter="week">This week</button>
            <button class="date-filter-badge" onclick="setDateFilter('${roleKey}', 'month')" data-filter="month">This month</button>
          </div>
          <div id="kanban-${roleKey}" class="kanban-board"></div>
        </div>`;
    });
    
    container.innerHTML = html;
  }

  /**
   * Render settings modal with role editors
   */
  function renderSettingsModal() {
    const editor = document.getElementById('roles-editor');
    if (!editor) return;

    let html = '';
    roles.forEach((role, i) => {
      html += `
        <div style="display: flex; gap: 0.5rem;">
          <input type="text" value="${role}" maxlength="15"
            onchange="updateRole(${i}, this.value)"
            style="flex: 1; padding: 0.5rem 0.75rem; border: 1px solid #FFD6E7; border-radius: 0.5rem; font-size: 0.875rem;">
          <button onclick="deleteRole(${i})" style="padding: 0.5rem 0.75rem; background: #FFE0E8; border: none; border-radius: 0.5rem; color: #C05070; cursor: pointer; font-weight: 500;">Delete</button>
        </div>`;
    });

    if (roles.length < 4) {
      html += `
        <button onclick="addRole()" 
          style="width: 100%; padding: 0.75rem; background: #E6D6FF; border: 2px solid #A888E0; border-radius: 0.75rem; color: #6040A0; font-weight: 600; cursor: pointer; margin-top: 0.5rem;">
          + Add Role
        </button>`;
    }

    editor.innerHTML = html;
  }

  /**
   * Update role name
   */
  function updateRole(index, newName) {
    if (newName.trim()) {
      roles[index] = newName.trim();
      saveRoles();
      renderNavTabs();
      renderRoleTabs();
      render();
    }
  }

  /**
   * Delete role
   */
  function deleteRole(index) {
    if (roles.length > 1 && confirm(`Delete role "${roles[index]}"?`)) {
      roles.splice(index, 1);
      saveRoles();
      loadRoles();
      renderNavTabs();
      renderRoleTabs();
      if (activeTab === roles[index]?.toLowerCase().replace(/\s+/g, '_')) {
        activeTab = 'overview';
      }
      render();
      renderSettingsModal();
    }
  }

  /**
   * Add new role
   */
  function addRole() {
    if (roles.length < 4) {
      const newRole = prompt('Enter new role name (max 15 characters):');
      if (newRole && newRole.trim()) {
        const trimmed = newRole.trim().substring(0, 15);
        roles.push(trimmed);
        saveRoles();
        loadRoles();
        renderNavTabs();
        renderRoleTabs();
        render();
        renderSettingsModal();
      }
    }
  }

  /**
   * Open settings modal
   */
  function openSettingsModal() {
    const modal = document.getElementById('settings-modal-overlay');
    if (modal) {
      renderSettingsModal();
      modal.classList.add('active');
    }
  }

  /**
   * Close settings modal
   */
  function closeSettingsModal(e) {
    if (e && e.target.id !== 'settings-modal-overlay') return;
    const modal = document.getElementById('settings-modal-overlay');
    if (modal) modal.classList.remove('active');
  }

  /**
   * Get role color class for calendar events
   * @param {string} role
   * @returns {string}
   */
  function getRoleEventClass(role) {
    const map = {
      QA: 'event-qa',
      Marketing: 'event-marketing',
      Finance: 'event-finance',
    };
    return map[role] || '';
  }

  /**
   * Get priority color class for calendar events
   * @param {Priority} priority
   * @returns {string}
   */
  function getPriorityEventClass(priority) {
    const map = {
      High: 'event-high',
      Medium: 'event-medium',
      Low: 'event-low',
    };
    return map[priority] || '';
  }

  /**
   * Convert tasks to calendar events
   * @returns {Object[]}
   */
  function getCalendarEvents() {
    return tasks
      .filter(t => t.due && !t.done)
      .map(t => ({
        id: `task-${t.id}`,
        title: t.title,
        start: t.due,
        end: t.due,
        classNames: [getRoleEventClass(t.role), getPriorityEventClass(t.priority)],
        extendedProps: {
          role: t.role,
          priority: t.priority,
          status: t.status,
          taskId: t.id,
        },
        display: 'block',
      }));
  }

  /**
   * Initialize FullCalendar
   */
  function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,dayGridWeek',
      },
      height: 'auto',
      contentHeight: 'auto',
      events: getCalendarEvents(),
      eventClick: function(info) {
        const taskId = info.event.extendedProps.taskId;
        if (taskId) {
          const task = tasks.find(t => t.id === taskId);
          if (task) {
            showTaskDetail(task);
          }
        }
      },
      eventMouseEnter: function(info) {
        const task = tasks.find(t => t.id === info.event.extendedProps.taskId);
        if (task) {
          info.el.title = `${task.role} · ${task.priority} · ${task.status}`;
        }
      },
      dayCellDidMount: function(info) {
        // Add custom styling for days with tasks
        const dayTasks = tasks.filter(t => t.due === info.dateStr && !t.done);
        if (dayTasks.length > 0) {
          info.el.style.backgroundColor = 'rgba(240, 160, 192, 0.05)';
        }
      },
      datesSet: function() {
        // Update events when calendar view changes
      },
    });

    calendar.render();
  }

  /**
   * Update calendar events when tasks change
   */
  function updateCalendarEvents() {
    if (calendar) {
      calendar.removeAllEvents();
      calendar.addEventSource(getCalendarEvents());
    }
  }

  /**
   * Show task details in modal
   * @param {Task} task
   */
  function showTaskDetail(task) {
    const modal = document.getElementById('task-modal-overlay');
    if (!modal) return;

    // Store current task for actions
    window.currentModalTask = task;

    // Populate modal with task data
    const titleEl = document.getElementById('modal-task-title');
    const statusEl = document.getElementById('modal-status-pill');
    const priorityEl = document.getElementById('modal-priority-pill');
    const roleEl = document.getElementById('modal-role-pill');
    const dueEl = document.getElementById('modal-due-date');

    if (titleEl) titleEl.textContent = task.title;
    if (statusEl) statusEl.innerHTML = statusPill(task.status);
    if (priorityEl) priorityEl.innerHTML = priPill(task.priority);
    if (roleEl) roleEl.innerHTML = rolePill(task.role);
    if (dueEl) dueEl.textContent = task.due ? formatDate(task.due) : 'No due date';

    // Show modal with animation
    modal.classList.add('active');
  }

  /**
   * Close task detail modal
   * @param {Event} [e]
   */
  function closeTaskModal(e) {
    if (e && e.target.id !== 'task-modal-overlay') return;
    const modal = document.getElementById('task-modal-overlay');
    if (modal) modal.classList.remove('active');
    window.currentModalTask = null;
  }

  /**
   * Mark current modal task as done
   */
  function markTaskDone() {
    const task = window.currentModalTask;
    if (task) {
      task.done = true;
      task.status = 'Done';
      saveData();
      render();
      closeTaskModal();
    }
  }

  /**
   * Delete current modal task
   */
  function deleteCurrentTask() {
    const task = window.currentModalTask;
    if (task && confirm(`Delete "${task.title}"?`)) {
      deleteTask(task.id);
      closeTaskModal();
    }
  }


  // ─── Init ──────────────────────────────────────────────────────────────────
  (function init() {
    // Set today label
    const todayEl = document.getElementById('today-label');
    if (todayEl) {
      todayEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    // Load roles first
    loadRoles();
    
    // Generate dynamic UI for roles
    renderNavTabs();
    renderRoleTabs();
    updateRoleSelect();

    loadData();
    render();
    updatePomoDisplay();
    updateTomatoDisplay();

    // Initialize calendar
    setTimeout(() => {
      initCalendar();
    }, 100);

    // Notepad autosave on input
    const notepad = document.getElementById('notepad');
    if (notepad) {
      let noteTimer = 0;
      notepad.addEventListener('input', () => {
        clearTimeout(noteTimer);
        noteTimer = setTimeout(saveNote, 800);
      });
    }
  })();