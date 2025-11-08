import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import { getDatabase, ref, onValue, runTransaction, get, child } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

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

const WEEK_STARTS_ON_SUNDAY = false;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const el = (id) => document.getElementById(id);
const tapBtn = el('tap');
const statusEl = el('status');
const todayCountEl = el('todayCount');
const todayLabelEl = el('todayLabel');
const weekStripEl = el('weekStrip');
const rangeEl = el('range');
const prevWeekBtn = el('prevWeek');
const nextWeekBtn = el('nextWeek');

const pad = (n) => String(n).padStart(2,'0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const nice = (d) => d.toLocaleDateString(undefined, { weekday:'long', month:'short', day:'numeric' });

const startOfWeek = (d) => {
  const day = d.getDay();
  const diff = WEEK_STARTS_ON_SUNDAY ? day : (day === 0 ? 6 : day-1);
  const s = new Date(d); s.setHours(0,0,0,0); s.setDate(s.getDate() - diff); return s;
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };

let uid = null;
onAuthStateChanged(getAuth(), async (user) => {
  if (!user) await signInAnonymously(auth);
  uid = (user || auth.currentUser).uid;
  statusEl.textContent = "";
  init();
});

let today = new Date(); today.setHours(0,0,0,0);
let viewingWeekStart = startOfWeek(today);

function updateRangeLabel() {
  const s = viewingWeekStart;
  const e = addDays(s, 6);
  rangeEl.textContent = `${s.toLocaleDateString(undefined,{month:'short',day:'numeric'})} – ${e.toLocaleDateString(undefined,{month:'short',day:'numeric'})}`;
}

let currentWeekCells = new Map();

async function init() {
  todayLabelEl.textContent = `Today • ${nice(today)}`;
  const todayKey = ymd(today);
  const todayRef = ref(db, `users/${uid}/daily/${todayKey}/count`);
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
  const dbRoot = ref(db, `users/${uid}/daily`);
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
