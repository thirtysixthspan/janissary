/* eslint-disable max-lines */
import type { Tab, LogEntry, AgentState, ImageView, MarkdownView, EditorView, PageView, FileTreeView } from './types.js';
import type { ConnectionView, ScheduleView, TabView } from './protocol.js';
import {
  makeTab, distinctColor, insertTabInGroup,
  swapTabsLeft, swapTabsRight, stripComments,
} from './tab.js';
import { saveAgentState, listAgentStates } from './agent/state.js';
import { abbreviatePath } from './paths.js';
import { getConfig } from './config.js';
import { messageBus } from './bus.js';
import { closeTabResources } from './tab-cleanup.js';
import type { Managers } from './managers.js';
import * as tabOpeners from './tab-openers.js';
import { getQueue, pushQueue, shiftQueue, updateQueueEntry, removeQueueEntry } from './tab-queue.js';
import { buildTabView } from './tab-view.js';
import { rehydrateTabs } from './tab-rehydrate.js';
import { buildAgentStateFromTab } from './tab-agent-state.js';

export class TabManager {
  tabs: Tab[] = [];
  activeTab = 0;
  private cwd = new Map<string, string>();
  private busy = new Set<string>();
  private context = new Map<string, string[]>();
  private queue = new Map<string, string[]>();
  private onIdle: ((label: string) => void) | null = null;
  private openFiles = new Map<string, string>();
  private openFileCounter = 0;
  private readonly rootDir: string;
  get launchDir(): string { return this.rootDir; }
  static readonly OPEN_MAX_FILES = 10;

  constructor(private managers: Managers, projectDir?: string) {
    this.rootDir = projectDir ?? process.cwd();
    this.tabs = [this.makeRootTab()];
    this.cwd.set('janus', this.rootDir);
  }

  cur(): Tab {
    return this.tabs[this.activeTab] ?? this.tabs[0];
  }

  allLabels(): string[] {
    return this.tabs.map((t) => t.label);
  }

  isBusy(label: string): boolean {
    return this.busy.has(label);
  }

  cwdOf(label: string): string | undefined {
    return this.cwd.get(label);
  }

  setCwd(label: string, dir: string): void {
    this.cwd.set(label, dir);
  }

  addBusy(label: string): void {
    this.busy.add(label);
  }

  deleteBusy(label: string): void {
    this.busy.delete(label);
    if (this.queueFor(label).length > 0) {
      queueMicrotask(() => this.onIdle?.(label));
    }
  }

  setOnIdle(hook: (label: string) => void): void {
    this.onIdle = hook;
  }

  queueFor(label: string): string[] {
    return getQueue(this.queue, label);
  }

  enqueue(label: string, text: string): void {
    pushQueue(this.queue, label, text);
    this.persistQueue(label);
  }

  dequeue(label: string): string | undefined {
    const front = shiftQueue(this.queue, label);
    if (front !== undefined) this.persistQueue(label);
    return front;
  }

  editQueued(label: string, index: number, text: string): void {
    if (updateQueueEntry(this.queue, label, index, text)) this.persistQueue(label);
  }

  deleteQueued(label: string, index: number): void {
    if (removeQueueEntry(this.queue, label, index)) this.persistQueue(label);
  }

  private persistQueue(label: string): void {
    const tab = this.tabs.find((t) => t.label === label);
    if (tab) this.persist(this.buildAgentState(tab));
    messageBus.emit('state', { type: 'dirty' });
  }

  contextFor(label: string): string[] {
    return this.context.get(label) ?? [];
  }

  setContext(label: string, ctx: string[]): void {
    this.context.set(label, ctx);
  }

  appendContext(label: string, text: string): void {
    this.context.set(label, [...(this.context.get(label) ?? []), text]);
  }

  findIndex(label: string): number {
    return this.tabs.findIndex((t) => t.label === label);
  }

  persist(state: AgentState): void {
    try {
      saveAgentState(state);
    } catch { /* ignore */ }
  }

  buildAgentState(tab: Tab, extra?: Partial<AgentState>): AgentState {
    return buildAgentStateFromTab(
      tab, this.busy.has(tab.label), this.cwd.get(tab.label), this.context.get(tab.label), this.queue.get(tab.label), extra,
    );
  }

  private activeLabel(): string | undefined {
    return this.tabs[this.activeTab]?.label;
  }

  markUnread(label: string): void {
    if (label === this.activeLabel()) return;
    const tab = this.tabs.find((t) => t.label === label);
    if (tab) tab.hasUnread = true;
  }

  setActiveTab(index: number): void {
    if (index < 0 || index >= this.tabs.length) return;
    if (this.tabs[index]?.dock) return; // a docked tab is never the active tab
    this.activeTab = index;
    const tab = this.tabs[index];
    if (tab) tab.hasUnread = false;
    messageBus.emit('state', { type: 'dirty' });
  }

  moveTab(dir: -1 | 1): void {
    const total = this.tabs.length;
    for (let step = 1; step <= total; step++) {
      const index = (this.activeTab + dir * step + total) % total;
      if (!this.tabs[index]?.dock) { this.setActiveTab(index); return; }
    }
  }

  // Dock a tab into a sidebar (`'left'` | `'right'`), or undock it back to the center strip
  // (`null`, which also makes it the active tab). Docking into a side that already holds a
  // tab of the *same view kind* displaces that occupant back to center (non-destructive —
  // nothing closes); a different-kind occupant (the file navigator and notifications tab
  // share a sidebar via the client's own tab-switcher) is left docked. Docking the active tab
  // first moves `activeTab` to the nearest non-docked tab, preserving the invariant that a
  // docked tab is never active.
  setDock(index: number, dock: 'left' | 'right' | null): void {
    const tab = this.tabs[index];
    if (!tab) return;
    if (dock === null) {
      tab.dock = undefined;
      this.activeTab = index;
      tab.hasUnread = false;
      messageBus.emit('state', { type: 'dirty' });
      return;
    }
    const occupant = this.tabs.find((t, i) => i !== index && t.dock === dock && t.view === tab.view);
    if (occupant) occupant.dock = undefined;
    tab.dock = dock;
    if (this.activeTab === index) this.activateNearestNonDocked();
    messageBus.emit('state', { type: 'dirty' });
  }

  private activateNearestNonDocked(): void {
    const total = this.tabs.length;
    for (let step = 0; step < total; step++) {
      const index = (this.activeTab + step) % total;
      if (!this.tabs[index]?.dock) { this.activeTab = index; return; }
    }
  }

  reorderTab(dir: -1 | 1): void {
    const from = this.activeTab;
    const next = dir < 0 ? swapTabsLeft(this.tabs, from) : swapTabsRight(this.tabs, from);
    if (next === this.tabs) return;
    this.tabs = next;
    const to = dir < 0 ? Math.max(0, from - 1) : Math.min(from + 1, this.tabs.length - 1);
    this.activeTab = to;
    const active = this.tabs[to];
    if (active) active.hasUnread = false;
    this.persist(this.buildAgentState(this.tabs[from]));
    this.persist(this.buildAgentState(this.tabs[to]));
    messageBus.emit('state', { type: 'dirty' });
  }

  closeTab(index: number): void {
    const tab = this.tabs[index];
    if (!tab) return;
    const nonDockedCount = this.tabs.filter((t) => !t.dock).length;
    closeTabResources(tab, this.managers, this.openFiles, this.context, this.queue, nonDockedCount);
    // Closing the last remaining non-docked tab quits the app (same as the `quit` command).
    if (!tab.dock && nonDockedCount <= 1) {
      messageBus.emit('app', { type: 'exit' });
      return;
    }
    this.tabs = this.tabs.filter((_, index_) => index_ !== index).map((t, index_) => ({ ...t, number: index_ + 1 }));
    this.activeTab = Math.min(this.activeTab, this.tabs.length - 1);
    const active = this.tabs[this.activeTab];
    if (active) active.hasUnread = false;
    messageBus.emit('state', { type: 'dirty' });
  }

  renameTab(index: number, title: string): void {
    const tab = this.tabs[index];
    if (!tab) return;
    const trimmed = title.trim().slice(0, getConfig().tabNameMaxLength);
    if (trimmed && trimmed !== tab.label) tab.title = trimmed;
    else delete tab.title;
    this.persist(this.buildAgentState(tab));
    messageBus.emit('state', { type: 'dirty' });
  }

  toggleCollapse(): void {
    const tab = this.cur();
    tab.toolStepsExpanded = !tab.toolStepsExpanded;
    messageBus.emit('state', { type: 'dirty' });
  }

  insertTabInGroup(tab: Tab): void {
    this.tabs = insertTabInGroup(this.tabs, tab);
  }

  private makeRootTab(): Tab {
    const tab = makeTab('janus', distinctColor([]));
    tab.toolStepsExpanded = false;
    return tab;
  }

  startRunning(label: string, input: string): void {
    this.busy.add(label);
    this.append(label, { input, output: '', running: true });
  }

  finishRunning(label: string, output: string): void {
    const t = this.tabs.find((x) => x.label === label);
    if (t) {
      const log = [...t.log];
      const index = log.findLastIndex((e) => e.running);
      if (index !== -1) log[index] = { ...log[index], output, running: false };
      t.log = log;
      this.deleteBusy(label);
      this.persist(this.buildAgentState(t));
    }
    if (output && t) {
      messageBus.emit('transcript', {
        type: 'entry:appended', tabLabel: label, entry: { input: '', output }, tab: t,
      });
    }
    this.markUnread(label);
    messageBus.emit('state', { type: 'dirty' });
  }

  private capLog(log: LogEntry[]): LogEntry[] {
    const max = getConfig().transcriptMaxLines;
    return log.length > max ? log.slice(log.length - max) : log;
  }

  append(label: string, entry: LogEntry): void {
    const tab = this.tabs.find((t) => t.label === label);
    if (!tab) return;
    const before = tab.log.length;
    tab.log = this.capLog([...tab.log, entry]);
    tab.scrollOffset = 0;
    const trimmed = before + 1 - tab.log.length;
    if (trimmed > 0) messageBus.emit('transcript', { type: 'entries:trimmed', tabLabel: label, count: trimmed });
    messageBus.emit('transcript', { type: 'entry:appended', tabLabel: label, entry, tab });
    this.markUnread(label);
    messageBus.emit('state', { type: 'dirty' });
  }

  clearTranscript(label: string): void {
    const tab = this.tabs.find((t) => t.label === label);
    if (!tab) return;
    tab.log = [];
    this.persist(this.buildAgentState(tab));
    messageBus.emit('transcript', { type: 'tab:cleared', tabLabel: label });
    messageBus.emit('state', { type: 'dirty' });
  }

  recordHistory(index: number, text: string): string {
    const trimmed = stripComments(text);
    const tab = this.tabs[index];
    if (tab) {
      if (trimmed && tab.cmdHistory.at(-1) !== trimmed) {
        tab.cmdHistory = [...tab.cmdHistory, trimmed].slice(-100);
      }
      tab.cmdHistoryIdx = -1;
    }
    return trimmed;
  }

  shorten(p: string): string {
    return abbreviatePath(p, { root: this.rootDir });
  }

  registerFile(absPath: string): string {
    const id = String(++this.openFileCounter);
    this.openFiles.set(id, absPath);
    return `/open/${id}`;
  }

  openFilePath(id: string): string | undefined {
    return this.openFiles.get(id);
  }

  view(
    connectionsFor: (label: string) => ConnectionView[],
    acpLabel: (label: string) => string | undefined,
    scheduleView: (label: string) => ScheduleView[],
  ): TabView[] {
    return this.tabs.map((t) => buildTabView(
      t,
      this.busy.has(t.label),
      this.cwd.get(t.label) ?? process.cwd(),
      acpLabel(t.label),
      connectionsFor(t.label),
      scheduleView(t.label),
      this.queue.get(t.label) ?? [],
      (p: string) => this.shorten(p),
    ));
  }

  openImageTab(image: ImageView): void {
    tabOpeners.openImageTab(this, image);
  }

  openMarkdownTab(view: MarkdownView): void {
    tabOpeners.openMarkdownTab(this, view);
  }

  openEditorTab(view: EditorView): void {
    tabOpeners.openEditorTab(this, view, (label, path) => this.managers.editorWatch.watch(label, path));
  }

  openPageTab(view: Pick<PageView, 'url' | 'domain'>): void {
    tabOpeners.openPageTab(this, view);
  }

  openFilesTab(view: FileTreeView): void {
    tabOpeners.openFilesTab(this, view);
  }

  openNotificationsTab(): void {
    tabOpeners.openNotificationsTab(this);
  }

  rehydrate(
    loadTranscript: (name: string) => LogEntry[] | undefined,
    onState: (state: AgentState) => void,
  ): void {
    const states = listAgentStates().toSorted((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
    if (states.length === 0) return;
    this.tabs = rehydrateTabs(states, loadTranscript, (log) => this.capLog(log));
    for (const s of states) {
      if (s.cwd) this.cwd.set(s.name, s.cwd);
      if (s.context) this.context.set(s.name, s.context);
      if (s.commandQueue) this.queue.set(s.name, s.commandQueue);
      onState(s);
    }
    this.activeTab = 0;
  }
}
