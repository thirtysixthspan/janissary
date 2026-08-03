import path from 'node:path';
import type { Tab, LogEntry, CenterPane } from './types.js';
import type { AgentState } from '../agent/types.js';
import type { ConnectionView, ScheduleView, TabView } from '../protocol.js';
import type { Managers } from '../managers.js';
import { saveAgentState } from '../agent/state.js';
import { abbreviatePath } from '../paths.js';
import { getConfig } from '../config.js';
import { messageBus } from '../bus.js';
import { TabOpeningState } from './opening-state.js';
import { buildAgentStateFromTab } from './agent-state.js';
import { recordLeavingActiveTab, popFocusHistory, mostRecentFileNavigatorLabel } from './focus-history.js';
import { FileRegistry } from './file-registry.js';
import { markUnreadTab } from './transcript-events.js';
import { repairPaneSelections, placeProfileTabSelection } from './split-selection.js';
import * as tabOperations from './operations.js';
import { tabRuntime } from './runtime.js';
import * as runtimeOperations from './runtime-operations.js';
import * as transcriptOperations from './transcript-operations.js';
import * as viewOperations from './view-operations.js';
import { applyOpenResult as applyOpenResultOp } from './open-result.js';
import { makeRootTab } from './root.js';

export class TabManager extends TabOpeningState {
  tabs: Tab[] = [];
  activeTab = 0;
  secondaryTabLabel?: string;
  private onIdle: ((label: string) => void) | null = null;
  private fileRegistry = new FileRegistry();
  // Labels of tabs that were previously active, most-recent-last. Closing the active tab pops
  // this to restore focus to whatever was focused right before it, rather than just clamping to
  // the nearest surviving index.
  focusHistory: string[] = [];
  private readonly rootDir: string;
  get launchDir(): string { return this.rootDir; }
  static readonly OPEN_MAX_FILES = 10;

  get openFiles(): Map<string, string> { return this.fileRegistry.map; }
  get managerServices(): Managers { return this.managers; }
  constructor(managers: Managers, projectDir?: string) {
    super(managers);
    this.rootDir = projectDir ?? process.cwd();
    this.tabs = [makeRootTab()];
    tabRuntime(this.tabs[0]).cwd = this.rootDir;
  }

  cur(): Tab {
    return this.tabs[this.activeTab] ?? this.tabs[0];
  }
  allLabels(): string[] {
    return this.tabs.map((t) => t.label);
  }

  isBusy(label: string): boolean {
    return runtimeOperations.isBusy(this.tabs, label);
  }
  cwdOf(label: string): string | undefined {
    return runtimeOperations.cwdOf(this.tabs, label);
  }

  setCwd(label: string, dir: string): void {
    runtimeOperations.setCwd(this.tabs, label, dir);
  }
  addBusy(label: string): void {
    runtimeOperations.addBusy(this.tabs, label);
  }

  deleteBusy(label: string): void {
    runtimeOperations.deleteBusy(this.tabs, label, this.queueFor(label).length, this.onIdle);
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
    return runtimeOperations.contextFor(this.tabs, label);
  }
  setContext(label: string, ctx: string[]): void {
    runtimeOperations.setContext(this.tabs, label, ctx);
  }

  appendContext(label: string, text: string): void {
    runtimeOperations.appendContext(this.tabs, label, text);
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
      tab, extra,
    );
  }

  markUnread(label: string): void {
    markUnreadTab(this.tabs, label, this.tabs[this.activeTab]?.label, this.secondaryTabLabel);
  }

  recordLeavingActiveTab(newIndex: number): void {
    this.focusHistory = recordLeavingActiveTab(this.tabs, this.activeTab, this.focusHistory, newIndex);
  }
  popFocusHistory(eligible?: (tab: Tab) => boolean): number | undefined {
    const { index, history } = popFocusHistory(this.tabs, this.focusHistory, eligible);
    this.focusHistory = history;
    return index;
  }

  repairSelections(): void {
    const selection = repairPaneSelections(this.tabs, this.activeTab, this.secondaryTabLabel);
    this.activeTab = selection.activeTab;
    this.secondaryTabLabel = selection.secondaryTabLabel;
  }

  mostRecentFileNavigatorLabel(): string | undefined {
    return mostRecentFileNavigatorLabel(this.tabs, this.focusHistory);
  }

  applyOpenResult(result: { tabs: Tab[]; activeTab: number }): void {
    const next = applyOpenResultOp(this.tabs, this.activeTab, this.secondaryTabLabel, this.focusHistory, result);
    this.tabs = next.tabs;
    this.activeTab = next.activeTab;
    this.secondaryTabLabel = next.secondaryTabLabel;
    this.focusHistory = next.focusHistory;
  }

  setActiveTab(index: number): void { tabOperations.setActiveTab(this, index); }

  moveTab(dir: -1 | 1): void { tabOperations.moveTab(this, dir); }

  setDock(index: number, dock: 'left' | 'right' | null): void { tabOperations.setDock(this, index, dock); }

  moveTabToOtherPane(index: number): void { tabOperations.moveTabToOtherPane(this, index); }

  placeProfileTabs(candidates: { label: string; number?: number; pane?: CenterPane }[]): void {
    tabOperations.placeProfileTabs(this, candidates, placeProfileTabSelection);
  }

  reorderTab(dir: -1 | 1): void { tabOperations.reorderTab(this, dir); }

  reorderTabTo(from: number, to: number): void { tabOperations.reorderTabTo(this, from, to); }

  closeTab(index: number): void { tabOperations.closeTab(this, index); }

  renameTab(index: number, title: string): void { tabOperations.renameTab(this, index, title); }

  navigatePage(index: number, url: string): void { tabOperations.navigatePage(this, index, url); }

  toggleCollapse(): void { tabOperations.toggleCollapse(this); }

  insertTabInGroup(tab: Tab): void { tabOperations.insertTab(this, tab); }

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

  startRunning(label: string, input: string): void {
    transcriptOperations.startRunning(this.tabs, label, input, (l, entry) => this.append(l, entry));
  }

  finishRunning(label: string, output: string): void {
    transcriptOperations.finishRunning(
      this.tabs, label, output,
      (l) => this.deleteBusy(l), (s) => this.persist(s), (t) => this.buildAgentState(t), (l) => this.markUnread(l),
    );
  }

  private capToConfiguredMax(log: LogEntry[]): LogEntry[] {
    return transcriptOperations.capToConfiguredMax(log, getConfig().transcriptMaxLines);
  }

  append(label: string, entry: LogEntry): void {
    transcriptOperations.append(
      this.tabs, label, entry, (log) => this.capToConfiguredMax(log),
      this.tabs[this.activeTab]?.label, this.secondaryTabLabel,
    );
  }

  clearTranscript(label: string): void {
    transcriptOperations.clearTranscript(
      this.tabs, label, (s) => this.persist(s), (t) => this.buildAgentState(t),
    );
  }

  recordHistory(index: number, text: string): string {
    return transcriptOperations.recordHistoryForTab(this.tabs[index], text);
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
  ): TabView[] {
    return viewOperations.viewTabs(
      this.tabs, this.managers,
      connectionsFor, acpLabel, scheduleView,
      (p: string) => this.shorten(p),
    );
  }

  rehydrate(
    loadTranscript: (name: string) => LogEntry[] | undefined,
    onState: (state: AgentState) => void,
  ): void {
    this.tabs = viewOperations.rehydrateTabs(
      this.tabs, loadTranscript, onState,
      (log) => this.capToConfiguredMax(log),
    );
    this.activeTab = 0;
    this.secondaryTabLabel = undefined;
  }
}
