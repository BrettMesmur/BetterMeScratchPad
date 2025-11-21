import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getDatabase, ref, onValue, runTransaction, get, child, set } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBjDvBqWHphOtEiI94ruYeRTXdaeeMRTQs",
  authDomain: "bettermescratchpad.firebaseapp.com",
  databaseURL: "https://bettermescratchpad-default-rtdb.firebaseio.com",
  projectId: "bettermescratchpad",
  storageBucket: "bettermescratchpad.firebasestorage.app",
  messagingSenderId: "516986845541",
  appId: "1:516986845541:web:75cd67831a7cc9d8f1498c",
  measurementId: "G-QLQBD1T7YC"
};

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

const WEEK_STARTS_ON_SUNDAY = false;
const DEFAULT_CONFIG = {
  banner: "",
  items: [
    { id: uuid(), type: "action", name: "Wake up on time", points: 5 },
    {
      id: uuid(),
      type: "group",
      name: "Morning Routine",
      children: [
        { id: uuid(), type: "action", name: "Drink water", points: 2 },
        { id: uuid(), type: "action", name: "Meditate", points: 3 },
      ]
    },
    { id: uuid(), type: "action", name: "Exercise", points: 4 }
  ]
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const el = (id) => document.getElementById(id);
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');
const bannerEl = el('globalBanner');

const tapBtn = el('tap');
const statusEl = el('status');
const todayCountEl = el('todayCount');
const todayLabelEl = el('todayLabel');
const weekStripEl = el('weekStrip');
const rangeEl = el('range');
const prevWeekBtn = el('prevWeek');
const nextWeekBtn = el('nextWeek');

const pointsActionsEl = el('pointsActions');
const pointsDayLabelEl = el('pointsDayLabel');
const pointsDayTotalEl = el('pointsDayTotal');
const pointsWeekStripEl = el('pointsWeekStrip');
const pointsRangeEl = el('pointsRange');
const pointsPrevWeekBtn = el('pointsPrevWeek');
const pointsNextWeekBtn = el('pointsNextWeek');

const bannerInput = el('bannerInput');
const saveBannerBtn = el('saveBanner');
const configListEl = el('configList');
const addRootActionBtn = el('addRootAction');
const addGroupBtn = el('addGroup');

const pad = (n) => String(n).padStart(2,'0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const nice = (d) => d.toLocaleDateString(undefined, { weekday:'long', month:'short', day:'numeric' });

const startOfWeek = (d) => {
  const day = d.getDay();
  const diff = WEEK_STARTS_ON_SUNDAY ? day : (day === 0 ? 6 : day-1);
  const s = new Date(d); s.setHours(0,0,0,0); s.setDate(s.getDate() - diff); return s;
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const move = (arr, from, to) => { const copy = [...arr]; const [item] = copy.splice(from,1); copy.splice(to,0,item); return copy; };

let uid = null;
let pointsConfig = null;
let actionLookup = new Map();
let today = new Date(); today.setHours(0,0,0,0);
let viewingWeekStart = startOfWeek(today);
let pointsViewingWeekStart = startOfWeek(today);
let pointsSelectedDay = today;
let currentWeekCells = new Map();
let pointsWeekCells = new Map();
let pointsDayUnsub = null;
let pointsDayData = { total: 0, actions: {} };

const dbPath = (p) => `users/${uid}/${p}`;

function setActiveTab(name) {
  tabs.forEach((t) => {
    const active = t.dataset.tab === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active);
  });
  panels.forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
});

onAuthStateChanged(getAuth(), async (user) => {
  if (!user) await signInAnonymously(auth);
  uid = (user || auth.currentUser).uid;
  statusEl.textContent = "";
  init();
});

function updateRangeLabel() {
  const s = viewingWeekStart;
  const e = addDays(s, 6);
  rangeEl.textContent = `${s.toLocaleDateString(undefined,{month:'short',day:'numeric'})} – ${e.toLocaleDateString(undefined,{month:'short',day:'numeric'})}`;
}

function updatePointsRangeLabel() {
  const s = pointsViewingWeekStart;
  const e = addDays(s, 6);
  pointsRangeEl.textContent = `${s.toLocaleDateString(undefined,{month:'short',day:'numeric'})} – ${e.toLocaleDateString(undefined,{month:'short',day:'numeric'})}`;
}

async function init() {
  todayLabelEl.textContent = `Today • ${nice(today)}`;
  pointsDayLabelEl.textContent = nice(pointsSelectedDay);

  setupTimesModule();
  setupPointsModule();
  setupConfigModule();
}

function setupTimesModule() {
  const todayKey = ymd(today);
  const todayRef = ref(db, dbPath(`daily/${todayKey}/count`));
  onValue(todayRef, (snap) => {
    const val = snap.exists() ? snap.val() : 0;
    todayCountEl.textContent = val;
    const cell = currentWeekCells.get(todayKey);
    if (cell) cell.textContent = val;
  });

  tapBtn.addEventListener('click', async () => {
    tapBtn.disabled = true;
    try {
      await runTransaction(todayRef, (cur) => (cur || 0) + 1);
    } catch (e) {
      alert('Increment failed: ' + e.message);
    } finally {
      tapBtn.disabled = false;
    }
  });

  prevWeekBtn.onclick = () => { viewingWeekStart = addDays(viewingWeekStart, -7); renderWeek(); };
  nextWeekBtn.onclick = () => {
    const next = addDays(viewingWeekStart, 7);
    if (startOfWeek(today) <= next) viewingWeekStart = startOfWeek(today);
    else viewingWeekStart = next;
    renderWeek();
  };
  renderWeek();
}

async function renderWeek() {
  updateRangeLabel();
  weekStripEl.innerHTML = '';
  const dbRoot = ref(db, dbPath('daily'));
  const dayNames = WEEK_STARTS_ON_SUNDAY ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                                         : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  currentWeekCells = new Map();
  const cells = [];
  for (let i=0;i<7;i++) {
    const cell = document.createElement('div'); cell.className = 'day';
    const dow = document.createElement('div'); dow.className = 'dow'; dow.textContent = dayNames[i];
    const mini = document.createElement('div'); mini.className = 'mini'; mini.textContent = '—';
    cell.appendChild(dow); cell.appendChild(mini);
    weekStripEl.appendChild(cell);
    const d = addDays(viewingWeekStart, i);
    const key = ymd(d);
    currentWeekCells.set(key, mini);
    cells.push({ mini, key });
  }

  const promises = [];
  for (let i=0;i<7;i++) {
    promises.push(get(child(dbRoot, `${cells[i].key}/count`)));
  }
  const snaps = await Promise.all(promises);
  snaps.forEach((s, i) => { cells[i].mini.textContent = s.exists() ? s.val() : 0; });
}

function setupPointsModule() {
  pointsPrevWeekBtn.onclick = () => { pointsViewingWeekStart = addDays(pointsViewingWeekStart, -7); renderPointsWeek(); };
  pointsNextWeekBtn.onclick = () => {
    const next = addDays(pointsViewingWeekStart, 7);
    if (startOfWeek(today) <= next) pointsViewingWeekStart = startOfWeek(today);
    else pointsViewingWeekStart = next;
    renderPointsWeek();
  };

  subscribeConfig();
  subscribePointsDay(pointsSelectedDay);
  renderPointsWeek();
}

function subscribeConfig() {
  const configRef = ref(db, dbPath('points/config'));
  onValue(configRef, async (snap) => {
    if (!snap.exists()) {
      await set(configRef, DEFAULT_CONFIG);
      return;
    }
    pointsConfig = snap.val();
    buildActionLookup();
    bannerInput.value = pointsConfig.banner || '';
    updateBanner();
    renderPointsList();
    renderConfigList();
    renderPointsWeek();
  });
}

function buildActionLookup() {
  actionLookup = new Map();
  const walk = (items) => {
    items.forEach((item) => {
      if (item.type === 'action') actionLookup.set(item.id, item);
      if (item.type === 'group' && Array.isArray(item.children)) walk(item.children);
    });
  };
  walk(pointsConfig?.items || []);
}

function subscribePointsDay(day) {
  const key = ymd(day);
  if (pointsDayUnsub) pointsDayUnsub();
  const dayRef = ref(db, dbPath(`points/daily/${key}`));
  pointsDayUnsub = onValue(dayRef, (snap) => {
    pointsDayData = snap.exists() ? snap.val() : { total: 0, actions: {} };
    reconcileDayTotal(key, pointsDayData);
    pointsDayLabelEl.textContent = nice(day);
    pointsDayTotalEl.textContent = pointsDayData.total || 0;
    const cell = pointsWeekCells.get(key);
    if (cell) cell.textContent = pointsDayData.total || 0;
    renderPointsList();
  });
}

function reconcileDayTotal(dayKey, data) {
  if (!pointsConfig || !data?.actions) return;
  const computed = Object.entries(data.actions || {}).reduce((sum, [id, active]) => {
    if (!active) return sum;
    const def = actionLookup.get(id);
    return sum + (def?.points || 0);
  }, 0);
  if (computed !== (data.total || 0)) {
    const dayRef = ref(db, dbPath(`points/daily/${dayKey}/total`));
    set(dayRef, computed);
    pointsDayData.total = computed;
  }
}

function renderPointsWeek() {
  updatePointsRangeLabel();
  pointsWeekStripEl.innerHTML = '';
  const dbRoot = ref(db, dbPath('points/daily'));
  const dayNames = WEEK_STARTS_ON_SUNDAY ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                                         : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  pointsWeekCells = new Map();
  const cells = [];
  for (let i=0;i<7;i++) {
    const cell = document.createElement('div'); cell.className = 'day';
    const dow = document.createElement('div'); dow.className = 'dow'; dow.textContent = dayNames[i];
    const mini = document.createElement('div'); mini.className = 'mini'; mini.textContent = '—';
    cell.appendChild(dow); cell.appendChild(mini);
    pointsWeekStripEl.appendChild(cell);
    const d = addDays(pointsViewingWeekStart, i);
    const key = ymd(d);
    if (key === ymd(pointsSelectedDay)) cell.classList.add('selected');
    cell.addEventListener('click', () => {
      pointsSelectedDay = d;
      pointsWeekStripEl.querySelectorAll('.day').forEach((c) => c.classList.remove('selected'));
      cell.classList.add('selected');
      subscribePointsDay(pointsSelectedDay);
    });
    pointsWeekCells.set(key, mini);
    cells.push({ mini, key });
  }

  const promises = [];
  for (let i=0;i<7;i++) promises.push(get(child(dbRoot, `${cells[i].key}/total`)));
  Promise.all(promises).then((snaps) => {
    snaps.forEach((s, i) => { cells[i].mini.textContent = s.exists() ? s.val() : 0; });
  });
}

function renderPointsList() {
  pointsActionsEl.innerHTML = '';
  if (!pointsConfig) return;
  const items = pointsConfig.items || [];
  items.forEach((item) => {
    const node = item.type === 'group' ? renderGroup(item) : renderActionRow(item);
    pointsActionsEl.appendChild(node);
  });
  pointsDayTotalEl.textContent = pointsDayData.total || 0;
}

function renderActionRow(action) {
  const row = document.createElement('button');
  row.className = 'action-row';
  row.type = 'button';
  const active = !!pointsDayData?.actions?.[action.id];
  if (active) row.classList.add('active');
  row.addEventListener('click', () => toggleAction(action));

  const texts = document.createElement('div'); texts.className = 'action-texts';
  const title = document.createElement('div'); title.className = 'action-title'; title.textContent = action.name;
  const pts = document.createElement('div'); pts.className = 'action-points'; pts.textContent = `${action.points} points`;
  texts.appendChild(title); texts.appendChild(pts);
  row.appendChild(texts);
  return row;
}

function renderGroup(group) {
  const wrapper = document.createElement('div'); wrapper.className = 'group';
  const header = document.createElement('div'); header.className = 'group-header'; header.textContent = group.name;
  const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = `${(group.children || []).length} actions`;
  header.appendChild(badge);
  const list = document.createElement('div'); list.className = 'group-actions';
  (group.children || []).forEach((child) => list.appendChild(renderActionRow(child)));
  wrapper.appendChild(header); wrapper.appendChild(list);
  return wrapper;
}

function toggleAction(action) {
  const dayKey = ymd(pointsSelectedDay);
  const dayRef = ref(db, dbPath(`points/daily/${dayKey}`));
  const currentActive = !!pointsDayData.actions?.[action.id];
  const nextActive = !currentActive;
  const nextActions = { ...(pointsDayData.actions || {}), [action.id]: nextActive };
  const nextTotal = Object.entries(nextActions).reduce((sum, [id, active]) => {
    if (!active) return sum;
    const def = actionLookup.get(id);
    return sum + (def?.points || 0);
  }, 0);

  pointsDayData = { total: nextTotal, actions: nextActions };
  pointsDayTotalEl.textContent = nextTotal;
  renderPointsList();
  const weekCell = pointsWeekCells.get(dayKey);
  if (weekCell) weekCell.textContent = nextTotal;

  runTransaction(dayRef, (cur) => {
    const data = cur || { total: 0, actions: {} };
    data.actions = { ...(data.actions || {}), [action.id]: nextActive };
    data.total = nextTotal;
    return data;
  });
}

function updateBanner() {
  if (!pointsConfig?.banner) {
    bannerEl.hidden = true;
    bannerEl.textContent = '';
    return;
  }
  bannerEl.hidden = false;
  bannerEl.textContent = pointsConfig.banner;
}

function setupConfigModule() {
  saveBannerBtn.addEventListener('click', () => {
    const next = { ...(pointsConfig || DEFAULT_CONFIG), banner: bannerInput.value.trim() };
    persistConfig(next);
  });
  addRootActionBtn.addEventListener('click', () => {
    const name = prompt('Action name?');
    if (!name) return;
    const pts = parseInt(prompt('Point value?') || '0', 10) || 0;
    const next = cloneConfig();
    next.items.push({ id: uuid(), type: 'action', name, points: pts });
    persistConfig(next);
  });
  addGroupBtn.addEventListener('click', () => {
    const name = prompt('Group name?');
    if (!name) return;
    const next = cloneConfig();
    next.items.push({ id: uuid(), type: 'group', name, children: [] });
    persistConfig(next);
  });
}

function cloneConfig() {
  return JSON.parse(JSON.stringify(pointsConfig || DEFAULT_CONFIG));
}

function persistConfig(cfg) {
  const configRef = ref(db, dbPath('points/config'));
  set(configRef, cfg);
}

function renderConfigList() {
  configListEl.innerHTML = '';
  const items = pointsConfig?.items || [];
  items.forEach((item, idx) => {
    const node = renderConfigItem(item, idx, items, (newItems) => {
      const next = cloneConfig();
      next.items = newItems;
      persistConfig(next);
    });
    configListEl.appendChild(node);
  });
}

function renderConfigItem(item, index, list, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'config-item';
  wrap.addEventListener('dragover', (e) => e.preventDefault());
  wrap.addEventListener('drop', (e) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    const to = index;
    if (Number.isNaN(from)) return;
    const nextList = move(list, from, to);
    onChange(nextList);
  });

  const row = document.createElement('div'); row.className = 'config-row';
  const meta = document.createElement('div'); meta.className = 'config-meta';
  const title = document.createElement('div'); title.textContent = item.name;
  const subtitle = document.createElement('div'); subtitle.className = 'muted';
  subtitle.textContent = item.type === 'group' ? 'Group' : `${item.points} points`;
  meta.appendChild(title); meta.appendChild(subtitle);
  const handle = document.createElement('div'); handle.className = 'handle'; handle.textContent = '↕';
  handle.draggable = true;
  handle.addEventListener('dragstart', (e) => {
    wrap.classList.add('dragging');
    e.dataTransfer.setData('text/plain', index);
  });
  handle.addEventListener('dragend', () => wrap.classList.remove('dragging'));
  row.appendChild(meta); row.appendChild(handle);
  wrap.appendChild(row);

  const actions = document.createElement('div'); actions.className = 'config-actions';
  const editBtn = document.createElement('button'); editBtn.className = 'btn'; editBtn.textContent = 'Edit';
  const delBtn = document.createElement('button'); delBtn.className = 'btn'; delBtn.textContent = 'Delete';
  const dupBtn = document.createElement('button'); dupBtn.className = 'btn'; dupBtn.textContent = 'Duplicate';
  actions.appendChild(editBtn); actions.appendChild(delBtn); actions.appendChild(dupBtn);

  editBtn.onclick = (e) => {
    e.stopPropagation();
    if (item.type === 'group') {
      const name = prompt('Group name?', item.name);
      if (!name) return;
      const next = cloneConfig();
      next.items[index].name = name;
      persistConfig(next);
    } else {
      const name = prompt('Action name?', item.name);
      if (!name) return;
      const pts = parseInt(prompt('Point value?', item.points) || `${item.points}`, 10) || 0;
      const next = cloneConfig();
      next.items[index].name = name;
      next.items[index].points = pts;
      persistConfig(next);
    }
  };

  delBtn.onclick = (e) => {
    e.stopPropagation();
    if (!confirm('Delete this item?')) return;
    const next = cloneConfig();
    next.items.splice(index, 1);
    persistConfig(next);
  };

  dupBtn.onclick = (e) => {
    e.stopPropagation();
    const next = cloneConfig();
    const clone = structuredClone(item);
    const insertAt = index + 1;
    if (clone.type === 'group') {
      clone.id = uuid();
      clone.name = `${clone.name} (Copy)`;
      clone.children = (clone.children || []).map((c) => ({ ...c, id: uuid(), name: `${c.name}` }));
    } else {
      clone.id = uuid();
      clone.name = `${clone.name} (Copy)`;
    }
    next.items.splice(insertAt, 0, clone);
    persistConfig(next);
  };

  wrap.appendChild(actions);

  if (item.type === 'group') {
    const addActionBtn = document.createElement('button'); addActionBtn.className = 'btn primary'; addActionBtn.textContent = '+ Action';
    addActionBtn.onclick = (e) => {
      e.stopPropagation();
      const name = prompt('Action name?'); if (!name) return;
      const pts = parseInt(prompt('Point value?') || '0', 10) || 0;
      const next = cloneConfig();
      const target = next.items[index];
      target.children = target.children || [];
      target.children.push({ id: uuid(), type: 'action', name, points: pts });
      persistConfig(next);
    };
    wrap.appendChild(addActionBtn);

    const childList = document.createElement('div'); childList.className = 'child-list';
    (item.children || []).forEach((child, cIdx) => {
      const childNode = renderChild(child, cIdx, item, (newChildren) => {
        const next = cloneConfig();
        next.items[index].children = newChildren;
        persistConfig(next);
      });
      childList.appendChild(childNode);
    });
    wrap.appendChild(childList);
  }

  return wrap;
}

function renderChild(child, index, group, onChange) {
  const wrap = document.createElement('div'); wrap.className = 'child';
  wrap.addEventListener('dragover', (e) => e.preventDefault());
  wrap.addEventListener('drop', (e) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    const to = index;
    if (Number.isNaN(from)) return;
    const nextList = move(group.children || [], from, to);
    onChange(nextList);
  });

  const row = document.createElement('div'); row.className = 'config-row';
  const meta = document.createElement('div'); meta.className = 'config-meta';
  const title = document.createElement('div'); title.textContent = child.name;
  const subtitle = document.createElement('div'); subtitle.className = 'muted'; subtitle.textContent = `${child.points} points`;
  meta.appendChild(title); meta.appendChild(subtitle);
  const handle = document.createElement('div'); handle.className = 'handle'; handle.textContent = '↕';
  handle.draggable = true;
  handle.addEventListener('dragstart', (e) => { wrap.classList.add('dragging'); e.dataTransfer.setData('text/plain', index); });
  handle.addEventListener('dragend', () => wrap.classList.remove('dragging'));
  row.appendChild(meta); row.appendChild(handle);
  wrap.appendChild(row);

  const actions = document.createElement('div'); actions.className = 'config-actions';
  const editBtn = document.createElement('button'); editBtn.className = 'btn'; editBtn.textContent = 'Edit';
  const delBtn = document.createElement('button'); delBtn.className = 'btn'; delBtn.textContent = 'Delete';
  const dupBtn = document.createElement('button'); dupBtn.className = 'btn'; dupBtn.textContent = 'Duplicate';
  actions.appendChild(editBtn); actions.appendChild(delBtn); actions.appendChild(dupBtn);
  wrap.appendChild(actions);

  editBtn.onclick = (e) => {
    e.stopPropagation();
    const name = prompt('Action name?', child.name); if (!name) return;
    const pts = parseInt(prompt('Point value?', child.points) || `${child.points}`, 10) || 0;
    const nextChildren = [...(group.children || [])];
    nextChildren[index] = { ...child, name, points: pts };
    onChange(nextChildren);
  };
  delBtn.onclick = (e) => {
    e.stopPropagation();
    if (!confirm('Delete this action?')) return;
    const nextChildren = [...(group.children || [])];
    nextChildren.splice(index, 1);
    onChange(nextChildren);
  };
  dupBtn.onclick = (e) => {
    e.stopPropagation();
    const nextChildren = [...(group.children || [])];
    const copy = { ...child, id: uuid(), name: `${child.name} (Copy)` };
    nextChildren.splice(index + 1, 0, copy);
    onChange(nextChildren);
  };

  return wrap;
}
