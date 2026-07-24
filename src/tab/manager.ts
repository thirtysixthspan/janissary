/* eslint-disable max-lines */
import path from 'node:path';
import type { Tab, LogEntry, AgentState } from '../types.js';
import type { AggregatedScheduleView, ConnectionView, ScheduleView, TabView } from '../protocol.js';
import type { Managers } from '../managers.js';
import {
  makeTab, distinctColor, insertTabInGroup,
} from './index.js';
import { saveAgentState } from '../agent/state.js';
import { abbreviatePath } from '../paths.js';
import { getConfig, TAB_RENAME_MAX_LENGTH } from '../config.js';
import { messageBus } from '../bus.js';
import { closeTabResources } from './cleanup.js';
import { TabOpeningState } from './opening-state.js';
import { buildAgentStateFromTab } from './agent-state.js';
import { recordLeavingActiveTab, popFocusHistory, mostRecentFileNavigatorLabel } from './focus-history.js';
import { applyDock } from './dock.js';
import { removeTabAt } from './reorder.js';
import { navigatePageTab } from './navigate.js';
import { recordHistory } from './history.js';
import { FileRegistry } from './file-registry.js';
import { renameEditorTab } from './rename-editor.js';
import { markUnreadTab } from './transcript-commands.js';
import {
  appendTabTranscript, buildTabViews, capTabLog, clearTabTranscript, finishTabRunning,
  rehydrateTabState, startTabRunning,
} from './transcript-operations.js';
import { setActiveTabOp, moveTabOp, reorderTabOp } from './navigation-commands.js';

export class TabManager extends TabOpeningState {
  tabs: Tab[] = [];
  activeTab = 0;
  private cwd = new Map<string, string>();
  private busy = new Set<string>();
  private context = new Map<string, string[]>();
  private onIdle: ((label: string) => void) | null = null;
  private fileRegistry = new FileRegistry();
  // Labels of tabs that were previously active, most-recent-last. Closing the active tab pops
  // this to restore focus to whatever was focused right before it, rather than just clamping to
  // the nearest surviving index.
  private focusHistory: string[] = [];
  private readonly rootDir: string;
  get launchDir(): string { return this.rootDir; }
  static readonly OPEN_MAX_FILES = 10;

  constructor(managers: Managers, projectDir?: string) {
    super(managers);
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

  protected persistQueue(label: string): void {
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
    markUnreadTab(this.tabs, label, this.activeLabel());
  }

  private recordLeavingActiveTab(newIndex: number): void {
    this.focusHistory = recordLeavingActiveTab(this.tabs, this.activeTab, this.focusHistory, newIndex);
  }

  private popFocusHistory(): number | undefined {
    const { index, history } = popFocusHistory(this.tabs, this.focusHistory);
    this.focusHistory = history;
    return index;
  }

  mostRecentFileNavigatorLabel(): string | undefined {
    return mostRecentFileNavigatorLabel(this.tabs, this.focusHistory);
  }

  // Applies the result of adding a new tab (or focusing an existing one) from the `openers.ts`
  // helpers, which otherwise assign `tabs`/`activeTab` directly and would bypass focus-history
  // tracking — a freshly opened, auto-focused tab still needs its predecessor recorded.
  applyOpenResult(result: { tabs: Tab[]; activeTab: number }): void {
    this.recordLeavingActiveTab(result.activeTab);
    this.tabs = result.tabs;
    this.activeTab = result.activeTab;
  }

  setActiveTab(index: number): void {
    setActiveTabOp(this.tabs, index, (i) => this.recordLeavingActiveTab(i), (i) => { this.activeTab = i; });
  }

  moveTab(dir: -1 | 1): void {
    moveTabOp(this.tabs, this.activeTab, dir, (index) => this.setActiveTab(index));
  }

  setDock(index: number, dock: 'left' | 'right' | null): void {
    if (this.tabs[index] === undefined) return;
    this.activeTab = applyDock(this.tabs, this.activeTab, index, dock, (i) => this.recordLeavingActiveTab(i));
    messageBus.emit('state', { type: 'dirty' });
  }

  reorderTab(dir: -1 | 1): void {
    reorderTabOp(
      this.tabs, this.activeTab, dir,
      (tabs, activeTab) => { this.tabs = tabs; this.activeTab = activeTab; },
      (s) => this.persist(s), (t) => this.buildAgentState(t),
    );
  }

  closeTab(index: number): void {
    const tab = this.tabs[index];
    if (!tab) return;
    const nonDockedCount = this.tabs.filter((t) => !t.dock).length;
    closeTabResources(tab, this.managers, this.fileRegistry.map, this.context, this.queue, nonDockedCount);
    // Closing the last remaining non-docked tab quits the app (same as the `quit` command).
    if (!tab.dock && nonDockedCount <= 1) {
      messageBus.emit('app', { type: 'exit' });
      return;
    }
    const wasActive = index === this.activeTab;
    this.focusHistory = this.focusHistory.filter((l) => l !== tab.label);
    this.tabs = removeTabAt(this.tabs, index);
    const restored = wasActive ? this.popFocusHistory() : undefined;
    this.activeTab = restored ?? Math.min(this.activeTab, this.tabs.length - 1);
    const active = this.tabs[this.activeTab];
    if (active) active.hasUnread = false;
    messageBus.emit('state', { type: 'dirty' });
  }

  renameTab(index: number, title: string): void {
    const tab = this.tabs[index];
    if (!tab) return;
    if (tab.editor) {
      renameEditorTab(
        tab, title, TAB_RENAME_MAX_LENGTH,
        (p) => this.registerFile(p), (l, p) => this.managers.editorWatch.watch(l, p),
      );
      this.persist(this.buildAgentState(tab));
      messageBus.emit('state', { type: 'dirty' });
      return;
    }
    const trimmed = title.trim().slice(0, TAB_RENAME_MAX_LENGTH);
    if (trimmed && trimmed !== tab.label) tab.title = trimmed;
    else delete tab.title;
    this.persist(this.buildAgentState(tab));
    messageBus.emit('state', { type: 'dirty' });
  }

  // Retarget an editor tab already open on `oldAbsPath` to `newAbsPath`, after something else (the
  // file navigator's rename) has already renamed the file on disk. Mirrors `renameEditorTab`'s
  // bookkeeping without repeating the disk rename it already performed. A no-op if no open editor
  // tab has that exact path.
  retargetEditorTab(oldAbsPath: string, newAbsPath: string): void {
    const tab = this.tabs.find((t) => t.editor?.path === oldAbsPath);
    if (!tab?.editor) return;
    const name = path.basename(newAbsPath);
    tab.editor = { ...tab.editor, path: newAbsPath, name, url: this.registerFile(newAbsPath) };
    tab.title = name;
    this.persist(this.buildAgentState(tab));
    this.managers.editorWatch.watch(tab.label, newAbsPath);
    messageBus.emit('state', { type: 'dirty' });
  }

  navigatePage(index: number, url: string): void {
    const tab = this.tabs[index];
    if (!tab || !navigatePageTab(tab, url)) return;
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
    startTabRunning(this.busy, label, input, (l, entry) => this.append(l, entry));
  }

  finishRunning(label: string, output: string): void {
    finishTabRunning(
      this.tabs, label, output,
      (l) => this.deleteBusy(l), (s) => this.persist(s), (t) => this.buildAgentState(t), (l) => this.markUnread(l),
    );
  }

  private capLog(log: LogEntry[]): LogEntry[] {
    return capTabLog(log, getConfig().transcriptMaxLines);
  }

  append(label: string, entry: LogEntry): void {
    appendTabTranscript(this.tabs, label, entry, (log) => this.capLog(log), (l) => this.markUnread(l));
  }

  clearTranscript(label: string): void {
    clearTabTranscript(this.tabs, label, (s) => this.persist(s), (t) => this.buildAgentState(t));
  }

  recordHistory(index: number, text: string): string {
    return recordHistory(this.tabs[index], text);
  }

  shorten(p: string): string {
    return abbreviatePath(p, { root: this.rootDir });
  }

  registerFile(absPath: string): string {
    return this.fileRegistry.register(absPath);
  }

  openFilePath(id: string): string | undefined {
    return this.fileRegistry.get(id);
  }

  view(
    connectionsFor: (label: string) => ConnectionView[],
    acpLabel: (label: string) => string | undefined,
    scheduleView: (label: string) => ScheduleView[],
    aggregatedSchedules: AggregatedScheduleView[],
  ): TabView[] {
    return buildTabViews(
      this.tabs, this.cwd, this.busy, this.queue, this.managers,
      connectionsFor, acpLabel, scheduleView, aggregatedSchedules,
      (p: string) => this.shorten(p),
    );
  }

  rehydrate(
    loadTranscript: (name: string) => LogEntry[] | undefined,
    onState: (state: AgentState) => void,
  ): void {
    this.tabs = rehydrateTabState(
      this.tabs, this.cwd, this.context, this.queue, loadTranscript, onState,
      (log) => this.capLog(log),
    );
    this.activeTab = 0;
  }
}
