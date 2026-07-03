/* eslint-disable max-lines */
import type { Tab, LogEntry, AgentState, ImageView, MarkdownView, EditorView, PageView } from './types.js';
import type { ConnectionView, ScheduleView, TabView } from './protocol.js';
import {
  makeTab, distinctColor, insertTabInGroup,
  flattenBuffer, swapTabsLeft, swapTabsRight, stripComments,
} from './tab.js';
import { saveAgentState, listAgentStates } from './agent-state.js';
import { abbreviatePath } from './paths.js';
import { getConfig } from './config.js';
import { messageBus } from './bus.js';
import { closeTabResources } from './tab-cleanup.js';
import type { Managers } from './managers.js';
import {
  addImageTab, addMarkdownTab, addEditorTab, addPageTab,
} from './tab-creators.js';

export class TabManager {
  tabs: Tab[] = [];
  activeTab = 0;
  private cwd = new Map<string, string>();
  private busy = new Set<string>();
  private context = new Map<string, string[]>();
  private openFiles = new Map<string, string>();
  private openFileCounter = 0;
  private readonly rootDir = process.cwd();
  static readonly OPEN_MAX_FILES = 10;

  constructor(private managers: Managers) {
    this.tabs = [this.makeRootTab()];
    this.cwd.set('janus', process.cwd());
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
    return {
      name: tab.label,
      dotColor: tab.dotColor,
      active: this.busy.has(tab.label),
      number: tab.number,
      group: tab.group,
      groupColor: tab.groupColor,
      cmdHistory: tab.cmdHistory,
      cwd: this.cwd.get(tab.label),
      context: this.context.get(tab.label),
      title: tab.title,
      ...extra,
    };
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
    this.activeTab = index;
    const tab = this.tabs[index];
    if (tab) tab.hasUnread = false;
    messageBus.emit('state', { type: 'dirty' });
  }

  moveTab(dir: -1 | 1): void {
    this.setActiveTab((this.activeTab + dir + this.tabs.length) % this.tabs.length);
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
    closeTabResources(tab, this.managers, this.openFiles, this.context, this.tabs.length);
    // Closing the last remaining tab quits the app (same as the `quit` command).
    if (this.tabs.length <= 1) {
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
      this.busy.delete(label);
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
    return this.tabs.map((t) => ({
      label: t.label,
      number: t.number,
      dotColor: t.dotColor,
      group: t.group,
      groupColor: t.groupColor,
      busy: this.busy.has(t.label),
      hasUnread: !!t.hasUnread,
      cwd: this.cwd.get(t.label) ?? process.cwd(),
      acp: acpLabel(t.label),
      connections: connectionsFor(t.label),
      schedule: scheduleView(t.label),
      bufferLines: flattenBuffer(t.log, !t.toolStepsExpanded)
        .map((l) => (l.cwd ? { ...l, cwd: this.shorten(l.cwd) } : l)),
      cmdHistory: t.cmdHistory,
      toolStepsExpanded: !!t.toolStepsExpanded,
      view: t.view,
      title: t.title,
      image: t.image,
      page: t.page,
      harness: t.harness,
      markdown: t.markdown,
      editor: t.editor,
      monitor: t.monitor,
      activePty: t.activePty,
    }));
  }

  openImageTab(image: ImageView): void {
    const { tabs, activeTab } = addImageTab(this.tabs, this.activeTab, image);
    this.tabs = tabs;
    this.activeTab = activeTab;
    messageBus.emit('state', { type: 'dirty' });
  }

  openMarkdownTab(view: MarkdownView): void {
    const { tabs, activeTab } = addMarkdownTab(this.tabs, this.activeTab, view);
    this.tabs = tabs;
    this.activeTab = activeTab;
    messageBus.emit('state', { type: 'dirty' });
  }

  openEditorTab(view: EditorView): void {
    const { tabs, activeTab } = addEditorTab(this.tabs, this.activeTab, view);
    this.tabs = tabs;
    this.activeTab = activeTab;
    messageBus.emit('state', { type: 'dirty' });
  }

  openPageTab({ url, domain }: Pick<PageView, 'url' | 'domain'>): void {
    const { tabs, activeTab } = addPageTab(this.tabs, this.activeTab, url, domain);
    this.tabs = tabs;
    this.activeTab = activeTab;
    messageBus.emit('state', { type: 'dirty' });
  }

  rehydrate(
    loadTranscript: (name: string) => LogEntry[] | undefined,
    onState: (state: AgentState) => void,
  ): void {
    const states = listAgentStates().toSorted((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
    if (states.length === 0) return;
    this.tabs = states.map((s, index) => {
      const log = this.capLog(loadTranscript(s.name) ?? s.log ?? []);
      const tab = makeTab(
        s.name, s.dotColor || distinctColor([]), s.number ?? index + 1, s.cmdHistory ?? [],
        log, s.workspaceDir, s.group ?? 1, s.groupColor || s.dotColor || '#5b9cff',
      );
      tab.toolStepsExpanded = false;
      if (s.title) tab.title = s.title;
      return tab;
    });
    for (const s of states) {
      if (s.cwd) this.cwd.set(s.name, s.cwd);
      if (s.context) this.context.set(s.name, s.context);
      onState(s);
    }
    this.activeTab = 0;
  }
}
