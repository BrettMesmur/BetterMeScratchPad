import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, Unsubscribe as AuthUnsubscribe } from 'firebase/auth';
import { child, DatabaseReference, get, getDatabase, onValue, ref, runTransaction, Unsubscribe } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyBjDvBqWHphOtEiI94ruYeRTXdaeeMRTQs',
  authDomain: 'bettermescratchpad.firebaseapp.com',
  databaseURL: 'https://bettermescratchpad-default-rtdb.firebaseio.com',
  projectId: 'bettermescratchpad',
  storageBucket: 'bettermescratchpad.firebasestorage.app',
  messagingSenderId: '516986845541',
  appId: '1:516986845541:web:75cd67831a7cc9d8f1498c',
  measurementId: 'G-QLQBD1T7YC'
};

const WEEK_STARTS_ON_SUNDAY = false;

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nice = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d: Date) => {
  const day = d.getDay();
  const diff = WEEK_STARTS_ON_SUNDAY ? day : (day === 0 ? 6 : day - 1);
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - diff);
  return s;
};

interface WeekDay {
  label: string;
  key: string;
  count: number | string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  status = 'Connecting…';
  todayLabel = '';
  todayCount: number | string = '—';
  rangeLabel = '';
  weekDays: WeekDay[] = [];
  tapBusy = false;
  enableRealtime = true;

  private readonly today = startOfDay(new Date());
  private viewingWeekStart = startOfWeek(this.today);
  private readonly app = initializeApp(firebaseConfig);
  private readonly auth = getAuth(this.app);
  private readonly db = getDatabase(this.app);
  private todayRef?: DatabaseReference;
  private todayUnsubscribe?: Unsubscribe;
  private authUnsubscribe?: AuthUnsubscribe;
  uid: string | null = null;
  private readonly dayNames = WEEK_STARTS_ON_SUNDAY
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  constructor() {
    this.todayLabel = `Today • ${nice(this.today)}`;
    this.prepareWeekDays();
  }

  ngOnInit(): void {
    if (!this.enableRealtime) {
      this.status = '';
      return;
    }

    this.authUnsubscribe = onAuthStateChanged(this.auth, async (user) => {
      if (!user) {
        await signInAnonymously(this.auth);
        return;
      }

      this.uid = user.uid;
      this.status = '';
      this.attachTodayListener();
      void this.renderWeek();
    });
  }

  ngOnDestroy(): void {
    this.todayUnsubscribe?.();
    this.authUnsubscribe?.();
  }

  get canGoNextWeek(): boolean {
    return startOfWeek(this.today).getTime() > this.viewingWeekStart.getTime();
  }

  async tap(): Promise<void> {
    if (!this.todayRef || !this.uid) return;
    this.tapBusy = true;
    try {
      await runTransaction(this.todayRef, (cur) => (cur || 0) + 1);
    } catch (e) {
      console.error('Increment failed', e);
      this.status = 'Increment failed. Please try again.';
    } finally {
      this.tapBusy = false;
    }
  }

  prevWeek(): void {
    this.setViewingWeek(addDays(this.viewingWeekStart, -7));
  }

  nextWeek(): void {
    if (!this.canGoNextWeek) return;
    const next = addDays(this.viewingWeekStart, 7);
    const currentWeekStart = startOfWeek(this.today);
    this.setViewingWeek(next > currentWeekStart ? currentWeekStart : next);
  }

  private setViewingWeek(date: Date): void {
    this.viewingWeekStart = date;
    this.prepareWeekDays();
    void this.renderWeek();
  }

  private prepareWeekDays(): void {
    this.updateRangeLabel();
    this.weekDays = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(this.viewingWeekStart, i);
      return {
        label: this.dayNames[i],
        key: ymd(day),
        count: '—'
      };
    });
  }

  private async renderWeek(): Promise<void> {
    if (!this.uid) return;
    const dbRoot = ref(this.db, `users/${this.uid}/daily`);
    const snaps = await Promise.all(this.weekDays.map((day) => get(child(dbRoot, `${day.key}/count`))));
    this.weekDays = this.weekDays.map((day, i) => ({
      ...day,
      count: snaps[i].exists() ? snaps[i].val() : 0
    }));
  }

  private attachTodayListener(): void {
    if (!this.uid) return;
    const todayKey = ymd(this.today);
    this.todayRef = ref(this.db, `users/${this.uid}/daily/${todayKey}/count`);
    this.todayUnsubscribe?.();
    this.todayUnsubscribe = onValue(this.todayRef, (snap) => {
      const val = snap.exists() ? snap.val() : 0;
      this.todayCount = val;
      const idx = this.weekDays.findIndex((day) => day.key === todayKey);
      if (idx >= 0) {
        this.weekDays = this.weekDays.map((day, i) => i === idx ? { ...day, count: val } : day);
      }
    });
  }

  private updateRangeLabel(): void {
    const s = this.viewingWeekStart;
    const e = addDays(s, 6);
    this.rangeLabel = `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
}
