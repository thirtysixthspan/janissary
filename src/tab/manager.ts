/* eslint-disable max-lines */
import path from 'node:path';
import type { Tab, LogEntry, AgentState, CenterPane } from '../types.js';
import type { AggregatedScheduleView, ConnectionView, ScheduleView, TabView } from '../protocol.js';
import type { Managers } from '../managers.js';
import {
  makeTab, distinctColor, insertTabInGroup,
} from './index.js';
import { saveAgentState } from '../agent/state.js';
import { abbreviatePath } from '../paths.js';
import { getConfig, TAB_RENAME_MAX_LENGTH } from '../config.js';
import { messageBus } from '../bus.js';
import { TabOpeningState } from './opening-state.js';
import { buildAgentStateFromTab } from './agent-state.js';
import { recordLeavingActiveTab, popFocusHistory, mostRecentFileNavigatorLabel } from './focus-history.js';
import { applyDock } from './dock.js';
import { navigatePageTab } from './navigate.js';
import { recordHistory } from './history.js';
import { FileRegistry } from './file-registry.js';
import { closeTabOp } from './close.js';
import { renameTabOp } from './rename.js';
import { markUnreadTab } from './transcript-commands.js';
import {
  appendTabTranscript, buildTabViews, capTabLog, clearTabTranscript, finishTabRunning,
  rehydrateTabState, startTabRunning,
} from './transcript-operations.js';
import { setActiveTabOp, moveTabOp, reorderTabOp, reorderTabToOp } from './navigation-commands.js';
import { centerPane, hasSplit, isCenterActionTab, moveToOtherPane } from './split.js';
import { applyProfileTabPanes, resolveProfileTabFocus } from './place-profile-tabs.js';

export class TabManager extends TabOpeningState {
  tabs: Tab[] = [];
  activeTab = 0;
  secondaryTabLabel?: string;
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
    markUnreadTab(this.tabs, label, this.activeLabel(), this.secondaryTabLabel);
  }

  private recordLeavingActiveTab(newIndex: number): void {
    this.focusHistory = recordLeavingActiveTab(this.tabs, this.activeTab, this.focusHistory, newIndex);
  }

  private popFocusHistory(eligible?: (tab: Tab) => boolean): number | undefined {
    const { index, history } = popFocusHistory(this.tabs, this.focusHistory, eligible);
    this.focusHistory = history;
    return index;
  }

  private recentLabel(eligible: (tab: Tab) => boolean, excluded?: string): string | undefined {
    for (let index = this.focusHistory.length - 1; index >= 0; index--) {
      const label = this.focusHistory[index];
      const tab = this.tabs.find((candidate) => candidate.label === label);
      if (tab && label !== excluded && eligible(tab)) return label;
    }
    return this.tabs.find((tab) => tab.label !== excluded && eligible(tab))?.label;
  }

  private focusedPane(): CenterPane {
    const active = this.tabs[this.activeTab];
    return active && isCenterActionTab(active) ? centerPane(active) : 'left';
  }

  private repairSelections(): void {
    const centerTabs = this.tabs.filter((tab) => isCenterActionTab(tab));
    const leftTabs = centerTabs.filter((tab) => centerPane(tab) === 'left');
    const rightTabs = centerTabs.filter((tab) => centerPane(tab) === 'right');
    if (leftTabs.length === 0 || rightTabs.length === 0) {
      for (const tab of centerTabs) tab.pane = undefined;
      this.secondaryTabLabel = undefined;
      return;
    }
    const active = this.tabs[this.activeTab];
    if (!active || !isCenterActionTab(active)) {
      this.activeTab = this.tabs.findIndex((tab) => tab.label === leftTabs[0].label);
    }
    const liveActive = this.tabs[this.activeTab];
    const oppositePane: CenterPane = centerPane(liveActive) === 'left' ? 'right' : 'left';
    const secondary = this.tabs.find((tab) => tab.label === this.secondaryTabLabel);
    if (
      !secondary
      || !isCenterActionTab(secondary)
      || centerPane(secondary) !== oppositePane
      || secondary.label === liveActive.label
    ) {
      this.secondaryTabLabel = centerTabs.find((tab) => centerPane(tab) === oppositePane)?.label;
    }
    liveActive.hasUnread = false;
    const visible = this.tabs.find((tab) => tab.label === this.secondaryTabLabel);
    if (visible) visible.hasUnread = false;
  }

  mostRecentFileNavigatorLabel(): string | undefined {
    return mostRecentFileNavigatorLabel(this.tabs, this.focusHistory);
  }

  // Applies the result of adding a new tab (or focusing an existing one) from the `openers.ts`
  // helpers, which otherwise assign `tabs`/`activeTab` directly and would bypass focus-history
  // tracking — a freshly opened, auto-focused tab still needs its predecessor recorded.
  applyOpenResult(result: { tabs: Tab[]; activeTab: number }): void {
    const previousTabs = this.tabs;
    const previousActive = previousTabs[this.activeTab];
    const previousLabels = new Set(previousTabs.map((tab) => tab.label));
    const opened = result.tabs[result.activeTab];
    if (opened && !previousLabels.has(opened.label) && isCenterActionTab(opened)) {
      opened.pane = this.focusedPane() === 'right' ? 'right' : undefined;
    }
    if (opened?.label !== previousActive?.label && previousActive) {
      this.focusHistory = [...this.focusHistory.filter((label) => label !== previousActive.label), previousActive.label];
    }
    this.tabs = result.tabs;
    this.activeTab = result.activeTab;
    if (
      opened
      && previousActive
      && hasSplit(this.tabs)
      && centerPane(opened) !== centerPane(previousActive)
    ) this.secondaryTabLabel = previousActive.label;
    this.repairSelections();
  }

  setActiveTab(index: number): void {
    setActiveTabOp(this.tabs, index, (i) => this.recordLeavingActiveTab(i), (i) => {
      const previous = this.tabs[this.activeTab];
      const next = this.tabs[i];
      if (
        previous
        && next
        && hasSplit(this.tabs)
        && isCenterActionTab(previous)
        && isCenterActionTab(next)
        && centerPane(previous) !== centerPane(next)
      ) this.secondaryTabLabel = previous.label;
      this.activeTab = i;
      this.repairSelections();
    });
  }

  moveTab(dir: -1 | 1): void {
    moveTabOp(this.tabs, this.activeTab, dir, (index) => this.setActiveTab(index));
  }

  setDock(index: number, dock: 'left' | 'right' | null): void {
    const tab = this.tabs[index];
    if (tab === undefined) return;
    const sourcePane = centerPane(tab);
    const wasActive = index === this.activeTab;
    const wasSecondary = tab.label === this.secondaryTabLabel;
    const focusedPane = this.focusedPane();
    if (dock === null) tab.pane = focusedPane === 'right' ? 'right' : undefined;
    else tab.pane = undefined;
    this.activeTab = applyDock(this.tabs, this.activeTab, index, dock, (i) => this.recordLeavingActiveTab(i));
    if (dock !== null && wasActive && hasSplit(this.tabs)) {
      const replacement = this.recentLabel(
        (candidate) => isCenterActionTab(candidate) && centerPane(candidate) === sourcePane,
        tab.label,
      );
      if (replacement) this.activeTab = this.findIndex(replacement);
    }
    if (dock !== null && wasSecondary) this.secondaryTabLabel = undefined;
    if (dock === null) tab.hasUnread = false;
    this.repairSelections();
    messageBus.emit('state', { type: 'dirty' });
  }

  moveTabToOtherPane(index: number): void {
    const target = this.tabs[index];
    const active = this.tabs[this.activeTab];
    if (!target || !active) return;
    const result = moveToOtherPane(
      this.tabs, target.label, active.label, this.secondaryTabLabel, this.focusHistory,
    );
    if (!result) return;
    if (target.label !== active.label) this.recordLeavingActiveTab(index);
    this.tabs = result.tabs;
    this.activeTab = this.findIndex(result.activeLabel);
    this.secondaryTabLabel = result.secondaryLabel;
    this.repairSelections();
    messageBus.emit('state', { type: 'dirty' });
  }

  placeProfileTabs(candidates: { label: string; number?: number; pane?: CenterPane }[]): void {
    applyProfileTabPanes(this.tabs, candidates);
    const focus = resolveProfileTabFocus(this.tabs, this.activeTab, candidates, (label) => this.findIndex(label));
    if (focus.activeTab !== undefined) this.activeTab = focus.activeTab;
    if (focus.secondaryTabLabel !== undefined) this.secondaryTabLabel = focus.secondaryTabLabel;
    this.repairSelections();
  }

  reorderTab(dir: -1 | 1): void {
    reorderTabOp(
      this.tabs, this.activeTab, dir,
      (tabs, activeTab) => { this.tabs = tabs; this.activeTab = activeTab; },
      (s) => this.persist(s), (t) => this.buildAgentState(t),
    );
  }

  reorderTabTo(from: number, to: number): void {
    reorderTabToOp(
      this.tabs, this.activeTab, from, to,
      (tabs, activeTab) => { this.tabs = tabs; this.activeTab = activeTab; },
      (s) => this.persist(s), (t) => this.buildAgentState(t),
    );
  }

  closeTab(index: number): void {
    const closing = this.tabs[index];
    if (!closing) return;
    const closingPane = centerPane(closing);
    const wasActive = index === this.activeTab;
    const wasSecondary = closing.label === this.secondaryTabLabel;
    closeTabOp(
      this.tabs, this.activeTab, index, this.managers, this.fileRegistry.map, this.context, this.queue,
      (label) => { this.focusHistory = this.focusHistory.filter((l) => l !== label); },
      () => this.popFocusHistory(
        (tab) => isCenterActionTab(tab) && centerPane(tab) === closingPane && tab.label !== closing.label,
      ),
      (tabs, activeTab) => {
        this.tabs = tabs;
        this.activeTab = activeTab;
        if (wasActive && hasSplit(tabs) && centerPane(tabs[activeTab]) !== closingPane) {
          const replacement = this.recentLabel(
            (tab) => isCenterActionTab(tab) && centerPane(tab) === closingPane,
          );
          if (replacement) this.activeTab = this.findIndex(replacement);
        }
        if (wasSecondary) this.secondaryTabLabel = undefined;
        this.repairSelections();
      },
    );
  }

  renameTab(index: number, title: string): void {
    renameTabOp(
      this.tabs, index, title, TAB_RENAME_MAX_LENGTH,
      (p) => this.registerFile(p), (l, p) => this.managers.editorWatch.watch(l, p),
      (s) => this.persist(s), (t) => this.buildAgentState(t),
    );
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
    if (isCenterActionTab(tab)) tab.pane = this.focusedPane() === 'right' ? 'right' : undefined;
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
    for (const tab of this.tabs) tab.pane = undefined;
    this.activeTab = 0;
    this.secondaryTabLabel = undefined;
  }
}
