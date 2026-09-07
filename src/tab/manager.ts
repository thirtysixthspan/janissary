import type { Tab, LogEntry, CenterPane } from './types.js';
import type { AgentState } from '../agent/types.js';
import type { ConnectionView, ScheduleView, TabView } from '../protocol.js';
import type { Managers } from '../managers.js';
import { abbreviatePath } from '../paths.js';
import { getConfig } from '../config.js';
import { messageBus } from '../bus.js';
import { TabOpeningState } from './opening-state.js';
import { buildAgentStateFromTab } from './agent-state.js';
import { FileRegistry } from './file-registry.js';
import { placeProfileTabSelection } from './split-selection.js';
import * as tabOperations from './operations.js';
import { tabRuntime } from './runtime.js';
import * as lookup from './lookup.js';
import * as runtimeOperations from './runtime-operations.js';
import * as selectionOperations from './selection-operations.js';
import * as transcriptOperations from './transcript-operations.js';
import * as viewOperations from './view-operations.js';
import { makeRootTab } from './root.js';
import { retargetEditorTab as retargetEditorTabOp } from './retarget-editor.js';
import { AgentStatePersistence } from './persistence.js';
import { persistAgentState } from './manager-persistence.js';

export class TabManager extends TabOpeningState {
  tabs: Tab[] = [];
  activeTab = 0;
  secondaryTabLabel?: string;
  private onIdle: ((label: string) => void) | null = null;
  private fileRegistry = new FileRegistry();
  private persistence = new AgentStatePersistence();
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

  // By-label lookups (see `./lookup.ts`). The guard-typed five return a narrowed tab, so a caller
  // gets a non-optional payload rather than a `Tab` plus its own optional-chained check; the
  // keyed four cover the navigation keys that are not labels.
  byLabel(label: string): Tab | undefined {
    return lookup.byLabel(this.tabs, label);
  }
  harnessTab(label: string) {
    return lookup.harnessTab(this.tabs, label);
  }
  editorTab(label: string) {
    return lookup.editorTab(this.tabs, label);
  }
  filesTab(label: string) {
    return lookup.filesTab(this.tabs, label);
  }
  pluginTab(label: string) {
    return lookup.pluginTab(this.tabs, label);
  }
  monitorTab(label: string) {
    return lookup.monitorTab(this.tabs, label);
  }
  harnessTabByPtyId(ptyId: string) {
    return lookup.harnessTabByPtyId(this.tabs, ptyId);
  }
  editorTabByUrl(url: string) {
    return lookup.editorTabByUrl(this.tabs, url);
  }
  pluginTabByInstanceKey(id: string, instanceKey: string) {
    return lookup.pluginTabByInstanceKey(this.tabs, id, instanceKey);
  }
  filesTabByRoot(root: string) {
    return lookup.filesTabByRoot(this.tabs, root);
  }

  // The single write path into the state directory: a remote agent tab is live and in-memory, and a
  // closed one no longer exists, so both are refused here rather than filtered at each call site.
  // See `persistAgentState`.
  persist(state: AgentState): void { persistAgentState(this.persistence, this.tabs, state); }

  // Stop persisting a tab that has been closed, before its state file is removed (see
  // `closeTabResources`).
  forgetPersisted(label: string): void { this.persistence.forget(label); }
  buildAgentState(tab: Tab, extra?: Partial<AgentState>): AgentState {
    return buildAgentStateFromTab(
      tab, extra,
    );
  }

  // Selection and focus history (see `./selection-operations.ts`).
  markUnread(label: string): void { selectionOperations.markUnread(this, label); }

  recordLeavingActiveTab(newIndex: number): void { selectionOperations.recordLeavingActiveTab(this, newIndex); }

  popFocusHistory(eligible?: (tab: Tab) => boolean): number | undefined {
    return selectionOperations.popFocusHistory(this, eligible);
  }

  repairSelections(): void { selectionOperations.repairSelections(this); }

  mostRecentFileNavigatorLabel(): string | undefined { return selectionOperations.mostRecentFileNavigatorLabel(this); }

  applyOpenResult(result: { tabs: Tab[]; activeTab: number }): void {
    selectionOperations.applyOpenResult(this, result);
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


  toggleCollapse(): void { tabOperations.toggleCollapse(this); }

  insertTabInGroup(tab: Tab): void { tabOperations.insertTab(this, tab); }

  retargetEditorTab(oldAbsPath: string, newAbsPath: string): void {
    retargetEditorTabOp(
      this.tabs, oldAbsPath, newAbsPath,
      (reference, filePath) => this.replaceFile(reference, filePath),
      (state) => this.persist(state), (tab) => this.buildAgentState(tab),
      (label, filePath) => this.managers.editorWatch.watch(label, filePath),
    );
  }

  startRunning(label: string, input: string): void {
    transcriptOperations.startRunning(this.tabs, label, input, (l, entry) => this.append(l, entry));
  }

  finishRunning(label: string, output: string, match?: transcriptOperations.RunningEntryMatch): void {
    transcriptOperations.finishRunning(this.tabs, label, output, (l) => this.deleteBusy(l), (s) => this.persist(s), (t) => this.buildAgentState(t), (l) => this.markUnread(l), match);
  }

  updateRunning(label: string, match: transcriptOperations.RunningEntryMatch | undefined, output: string, running: boolean, hooks: transcriptOperations.UpdateRunningHooks = {}): void {
    transcriptOperations.updateRunning(this.tabs, label, match, output, running, hooks);
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

  replaceFile(reference: string, absPath: string): string {
    return this.fileRegistry.replace(reference, absPath);
  }

  openFilePath(id: string): string | undefined {
    return this.fileRegistry.get(id);
  }

  view(connectionsFor: (label: string) => ConnectionView[], acpLabel: (label: string) => string | undefined, scheduleView: (label: string) => ScheduleView[]): TabView[] {
    return viewOperations.managerView({ tabs: this.tabs, managers: this.managers, shorten: (p: string) => this.shorten(p) }, connectionsFor, acpLabel, scheduleView);
  }

  rehydrate(loadTranscript: (name: string) => LogEntry[] | undefined, onState: (state: AgentState) => void): void {
    this.tabs = viewOperations.rehydrateTabViews(this.tabs, loadTranscript, onState, (log) => this.capToConfiguredMax(log));
    this.activeTab = 0;
    this.secondaryTabLabel = undefined;
  }
}
