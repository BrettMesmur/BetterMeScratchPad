import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, Unsubscribe as AuthUnsubscribe } from 'firebase/auth';
import { child, DatabaseReference, get, getDatabase, onValue, ref, runTransaction, set, Unsubscribe } from 'firebase/database';

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
const dateFromYmd = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return startOfDay(new Date(y, (m || 1) - 1, d || 1));
};

interface WeekDay {
  label: string;
  key: string;
  count: number | string;
}

type TabKey = 'points' | 'times' | 'config';

interface PointActionItem {
  id: string;
  type: 'action';
  name: string;
  points: number;
}

interface PointGroupItem {
  id: string;
  type: 'group';
  name: string;
  children: PointActionItem[];
}

type PointRootItem = PointActionItem | PointGroupItem;

interface PointsDayData {
  total: number;
  actions: Record<string, boolean>;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  tabs: { key: TabKey; label: string }[] = [
    { key: 'points', label: 'Points Earned' },
    { key: 'times', label: 'Times Gained Control' },
    { key: 'config', label: 'Configuration' }
  ];
  selectedTab: TabKey = 'points';

  status = 'Connecting…';
  todayLabel = '';
  todayCount: number | string = '—';
  rangeLabel = '';
  weekDays: WeekDay[] = [];
  tapBusy = false;
  enableRealtime = true;

  bannerText = '';
  pointItems: PointRootItem[] = [];
  pointsDayStates: Record<string, boolean> = {};
  pointsDayTotal = 0;
  selectedPointsDay = startOfDay(new Date());
  selectedPointsDayLabel = '';
  pointsWeekDays: WeekDay[] = [];
  pointsRangeLabel = '';
  toggleLocks: Record<string, boolean> = {};

  readonly ymd = ymd;

  private readonly today = startOfDay(new Date());
  private viewingWeekStart = startOfWeek(this.today);
  private pointsViewingWeekStart = startOfWeek(this.today);
  private readonly app = initializeApp(firebaseConfig);
  private readonly auth = getAuth(this.app);
  private readonly db = getDatabase(this.app);
  private readonly localConfigKey = 'betterme_points_config';
  private readonly permissionDeniedCodes = ['PERMISSION_DENIED', 'permission_denied'];
  private todayRef?: DatabaseReference;
  private todayUnsubscribe?: Unsubscribe;
  private pointsDayRef?: DatabaseReference;
  private pointsDayUnsubscribe?: Unsubscribe;
  private authUnsubscribe?: AuthUnsubscribe;
  uid: string | null = null;
  private readonly dayNames = WEEK_STARTS_ON_SUNDAY
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  constructor() {
    this.todayLabel = `Today • ${nice(this.today)}`;
    this.selectedPointsDayLabel = nice(this.selectedPointsDay);
    this.prepareWeekDays();
    this.preparePointsWeekDays();
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
      this.attachPointsDayListener();
      await this.loadPointsConfig();
      void this.renderWeek();
      void this.renderPointsWeek();
    });
  }

  ngOnDestroy(): void {
    this.todayUnsubscribe?.();
    this.pointsDayUnsubscribe?.();
    this.authUnsubscribe?.();
  }

  get canGoNextWeek(): boolean {
    return startOfWeek(this.today).getTime() > this.viewingWeekStart.getTime();
  }

  get canGoNextPointsWeek(): boolean {
    return startOfWeek(this.today).getTime() > this.pointsViewingWeekStart.getTime();
  }

  isGroup(item: PointRootItem): item is PointGroupItem { return item.type === 'group'; }
  isAction(item: PointRootItem): item is PointActionItem { return item.type === 'action'; }

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

  async toggleAction(action: PointActionItem): Promise<void> {
    if (!(await this.ensureAuthenticated())) return;
    const dayKey = ymd(this.selectedPointsDay);
    const refPath = ref(this.db, `users/${this.uid}/points/days/${dayKey}`);
    const prevStates = { ...this.pointsDayStates };
    const prevTotal = this.pointsDayTotal;

    if (this.toggleLocks[action.id]) return;
    this.toggleLocks = { ...this.toggleLocks, [action.id]: true };

    try {
      const txn = await this.runWithReauth(() => runTransaction(refPath, (cur) => {
        const current: PointsDayData = cur && typeof cur === 'object'
          ? { total: Number(cur.total) || 0, actions: cur.actions || {} }
          : { total: Number(cur) || 0, actions: {} };

        const nextActions = { ...current.actions } as Record<string, boolean>;
        let nextTotal = current.total;
        const isActive = !!current.actions[action.id];

        if (isActive) {
          nextTotal = Math.max(0, nextTotal - action.points);
          delete nextActions[action.id];
        } else {
          nextTotal += action.points;
          nextActions[action.id] = true;
        }

        return { total: nextTotal, actions: nextActions } as PointsDayData;
      }, { applyLocally: false }));

      if (!txn.committed || !txn.snapshot.exists()) {
        throw new Error('Points update was not committed');
      }

      // If the user switched days while the transaction was running, skip UI updates.
      if (ymd(this.selectedPointsDay) !== dayKey) return;

      const val = txn.snapshot.val() as PointsDayData;
      this.pointsDayStates = val.actions || {};
      this.pointsDayTotal = Number(val.total) || 0;
      this.pointsWeekDays = this.pointsWeekDays.map((day) => day.key === dayKey ? { ...day, count: this.pointsDayTotal } : day);
    } catch (e) {
      console.error('Toggle failed', e);
      const msg = this.isPermissionDenied(e)
        ? 'Permission denied saving your points. Please reload to re-authenticate.'
        : 'Unable to update points right now. Please try again.';
      this.status = msg;
      this.pointsDayStates = prevStates;
      this.pointsDayTotal = prevTotal;
      this.pointsWeekDays = this.pointsWeekDays.map((day) => day.key === dayKey ? { ...day, count: prevTotal } : day);
    } finally {
      const { [action.id]: _, ...rest } = this.toggleLocks;
      this.toggleLocks = rest;
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

  prevPointsWeek(): void {
    this.setPointsViewingWeek(addDays(this.pointsViewingWeekStart, -7));
  }

  nextPointsWeek(): void {
    if (!this.canGoNextPointsWeek) return;
    const next = addDays(this.pointsViewingWeekStart, 7);
    const currentWeekStart = startOfWeek(this.today);
    this.setPointsViewingWeek(next > currentWeekStart ? currentWeekStart : next);
  }

  selectPointsDay(dayKey: string): void {
    this.selectedPointsDay = dateFromYmd(dayKey);
    this.selectedPointsDayLabel = nice(this.selectedPointsDay);
    this.attachPointsDayListener();
  }

  addRootAction(): void {
    this.pointItems = [
      ...this.pointItems,
      this.createAction('New action', 1)
    ];
    void this.persistPointsConfig();
  }

  addGroup(): void {
    this.pointItems = [
      ...this.pointItems,
      {
        id: this.generateId(),
        type: 'group',
        name: 'New group',
        children: [this.createAction('New action', 1)]
      }
    ];
    void this.persistPointsConfig();
  }

  addChildAction(group: PointGroupItem): void {
    group.children = [...group.children, this.createAction('New action', 1)];
    void this.persistPointsConfig();
  }

  duplicateAction(action: PointActionItem, insertIndex?: number, targetGroup?: PointGroupItem): void {
    const clone = this.createAction(`${action.name} (Copy)`, action.points);
    if (targetGroup) {
      const idx = typeof insertIndex === 'number' ? insertIndex + 1 : targetGroup.children.indexOf(action) + 1;
      targetGroup.children = this.insertAt(targetGroup.children, idx, clone);
    } else {
      const idx = typeof insertIndex === 'number' ? insertIndex + 1 : this.pointItems.indexOf(action) + 1;
      this.pointItems = this.insertAt(this.pointItems, idx, clone);
    }
    void this.persistPointsConfig();
  }

  duplicateGroup(index: number): void {
    const group = this.pointItems[index];
    if (!this.isGroup(group)) return;
    const clone: PointGroupItem = {
      id: this.generateId(),
      type: 'group',
      name: `${group.name} (Copy)`,
      children: group.children.map((c) => this.createAction(c.name, c.points))
    };
    this.pointItems = this.insertAt(this.pointItems, index + 1, clone);
    void this.persistPointsConfig();
  }

  removeRootAction(index: number): void {
    if (!confirm('Delete this action?')) return;
    this.pointItems = this.pointItems.filter((_, i) => i !== index);
    void this.persistPointsConfig();
  }

  removeGroup(index: number): void {
    if (!confirm('Delete this group and all of its actions?')) return;
    this.pointItems = this.pointItems.filter((_, i) => i !== index);
    void this.persistPointsConfig();
  }

  removeChildAction(group: PointGroupItem, index: number): void {
    if (!confirm('Delete this action?')) return;
    group.children = group.children.filter((_, i) => i !== index);
    void this.persistPointsConfig();
  }

  dropRoot(event: CdkDragDrop<PointRootItem[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    moveItemInArray(this.pointItems, event.previousIndex, event.currentIndex);
    void this.persistPointsConfig();
  }

  dropChild(group: PointGroupItem, event: CdkDragDrop<PointActionItem[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    moveItemInArray(group.children, event.previousIndex, event.currentIndex);
    void this.persistPointsConfig();
  }

  updateActionName(action: PointActionItem, value: string): void {
    action.name = value;
    void this.persistPointsConfig();
  }

  updateActionPoints(action: PointActionItem, value: string | number): void {
    const num = typeof value === 'number' ? value : Number(value);
    action.points = Number.isFinite(num) ? num : 0;
    void this.persistPointsConfig();
  }

  updateGroupName(group: PointGroupItem, value: string): void {
    group.name = value;
    void this.persistPointsConfig();
  }

  async persistBanner(): Promise<void> {
    await this.persistPointsConfig();
  }

  private createAction(name: string, points: number): PointActionItem {
    return { id: this.generateId(), type: 'action', name, points };
  }

  private insertAt<T>(arr: T[], index: number, item: T): T[] {
    const copy = [...arr];
    copy.splice(index, 0, item);
    return copy;
  }

  private setViewingWeek(date: Date): void {
    this.viewingWeekStart = date;
    this.prepareWeekDays();
    void this.renderWeek();
  }

  private setPointsViewingWeek(date: Date): void {
    this.pointsViewingWeekStart = date;
    this.preparePointsWeekDays();
    const start = this.pointsViewingWeekStart.getTime();
    const end = addDays(this.pointsViewingWeekStart, 6).getTime();
    const selected = this.selectedPointsDay.getTime();
    if (selected < start || selected > end) {
      this.selectedPointsDay = startOfDay(this.pointsViewingWeekStart);
      this.selectedPointsDayLabel = nice(this.selectedPointsDay);
      this.attachPointsDayListener();
    }
    void this.renderPointsWeek();
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

  private preparePointsWeekDays(): void {
    this.updatePointsRangeLabel();
    this.pointsWeekDays = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(this.pointsViewingWeekStart, i);
      return {
        label: this.dayNames[i],
        key: ymd(day),
        count: 0
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

  private async renderPointsWeek(): Promise<void> {
    if (!this.uid) return;
    const dbRoot = ref(this.db, `users/${this.uid}/points/days`);
    const snaps = await Promise.all(this.pointsWeekDays.map((day) => get(child(dbRoot, `${day.key}/total`))));
    this.pointsWeekDays = this.pointsWeekDays.map((day, i) => ({
      ...day,
      count: snaps[i].exists() ? snaps[i].val() : 0
    }));
  }

  private async attachTodayListener(): Promise<void> {
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

  private attachPointsDayListener(): void {
    if (!this.uid) return;
    const dayKey = ymd(this.selectedPointsDay);
    this.pointsDayRef = ref(this.db, `users/${this.uid}/points/days/${dayKey}`);
    this.pointsDayUnsubscribe?.();
    this.pointsDayUnsubscribe = onValue(this.pointsDayRef, (snap) => {
      const val = snap.exists() ? snap.val() as PointsDayData : { total: 0, actions: {} };
      this.pointsDayTotal = Number(val.total) || 0;
      this.pointsDayStates = val.actions || {};
      const idx = this.pointsWeekDays.findIndex((day) => day.key === dayKey);
      if (idx >= 0) {
        this.pointsWeekDays = this.pointsWeekDays.map((day, i) => i === idx ? { ...day, count: this.pointsDayTotal } : day);
      }
    });
  }

  private async loadPointsConfig(): Promise<void> {
    let loadedFromServer = false;

    if (this.uid) {
      try {
        const configRef = ref(this.db, `users/${this.uid}/points/config`);
        const snap = await get(configRef);
        if (snap.exists()) {
          const val = snap.val();
          const rawItems: PointRootItem[] = Array.isArray(val?.items) ? val.items : [];
          this.pointItems = rawItems.map((item) => item.type === 'group'
            ? { id: item.id || this.generateId(), type: 'group', name: item.name || 'Group', children: (item as PointGroupItem).children?.map((c) => this.createAction(c.name, c.points)) || [] }
            : { id: item.id || this.generateId(), type: 'action', name: item.name || 'Action', points: Number((item as PointActionItem).points) || 0 });
          this.bannerText = val?.banner || '';
          loadedFromServer = true;
          this.persistLocalConfig();
        }
      } catch (e) {
        console.error('Failed to load config from Firebase', e);
        this.status = 'Using local settings due to sync error.';
      }
    }

    if (!loadedFromServer) {
      const local = this.loadLocalConfig();
      if (local) {
        this.pointItems = local.items;
        this.bannerText = local.banner;
      } else {
        this.pointItems = [
          this.createAction('Wake up on time', 5),
          {
            id: this.generateId(),
            type: 'group',
            name: 'Healthy choices',
            children: [
              this.createAction('Drink water', 3),
              this.createAction('Take a walk', 4)
            ]
          },
          this.createAction('Reflect on the day', 2)
        ];
      }

      await this.persistPointsConfig();
    }
  }

  private async persistPointsConfig(): Promise<void> {
    this.persistLocalConfig();
    if (!this.uid) return;
    const configRef = ref(this.db, `users/${this.uid}/points/config`);
    try {
      await set(configRef, { items: this.pointItems, banner: this.bannerText });
    } catch (e) {
      console.error('Persist failed', e);
      this.status = 'Unable to sync to cloud; your changes are saved locally.';
    }
  }

  private updateRangeLabel(): void {
    const s = this.viewingWeekStart;
    const e = addDays(s, 6);
    this.rangeLabel = `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }

  private updatePointsRangeLabel(): void {
    const s = this.pointsViewingWeekStart;
    const e = addDays(s, 6);
    this.pointsRangeLabel = `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }

  private generateId(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  private persistLocalConfig(): void {
    if (typeof localStorage === 'undefined') return;
    const payload = JSON.stringify({ items: this.pointItems, banner: this.bannerText });
    localStorage.setItem(this.localConfigKey, payload);
  }

  private async ensureAuthenticated(): Promise<boolean> {
    if (this.uid) return true;
    try {
      const cred = await signInAnonymously(this.auth);
      this.uid = cred.user?.uid || this.uid;
      return !!this.uid;
    } catch (e) {
      console.error('Auth failed', e);
      this.status = 'Unable to authenticate. Please reload the page.';
      return false;
    }
  }

  private isPermissionDenied(e: unknown): boolean {
    const code = (e as { code?: string })?.code || '';
    const message = (e as { message?: string })?.message || '';
    return this.permissionDeniedCodes.some((needle) => code.includes(needle) || message.includes(needle));
  }

  private async runWithReauth<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (!this.isPermissionDenied(e)) throw e;

      try {
        await signInAnonymously(this.auth);
        this.uid = this.auth.currentUser?.uid || this.uid;
      } catch (reauthError) {
        console.error('Re-auth failed', reauthError);
        throw e;
      }

      return await fn();
    }
  }

  private loadLocalConfig(): { items: PointRootItem[]; banner: string } | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(this.localConfigKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const rawItems: PointRootItem[] = Array.isArray(parsed?.items) ? parsed.items : [];
      return {
        items: rawItems.map((item) => item.type === 'group'
          ? { id: item.id || this.generateId(), type: 'group', name: item.name || 'Group', children: (item as PointGroupItem).children?.map((c) => this.createAction(c.name, c.points)) || [] }
          : { id: item.id || this.generateId(), type: 'action', name: item.name || 'Action', points: Number((item as PointActionItem).points) || 0 }),
        banner: parsed?.banner || ''
      };
    } catch (e) {
      console.error('Failed to read local config', e);
      return null;
    }
  }
}
