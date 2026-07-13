import { HarnessManager } from './harness-manager.js';
import { SshManager } from './ssh-manager.js';
import { DatabaseManager } from './database/manager.js';
import { AcpManager } from './acp/manager.js';
import { ShellManager } from './shell-manager.js';
import { WorkspaceManager } from './workspace-manager.js';
import { completeCommandLine } from './completion/index.js';
import type { CompletionResult, Sinks } from './types.js';
import { PseudoterminalManager } from './pseudoterminal-manager.js';
import { TranscriptStore } from './transcript/store.js';
import { ScheduleManager } from './schedule/manager.js';
import { ProfileManager } from './profile-manager.js';
import { ConnectionManager } from './connection/manager.js';
import { OpenFileManager } from './open-file-manager.js';
import { FileTreeManager } from './file-tree-manager.js';
import { EditorWatchManager } from './editor/watch-manager.js';
import { saveFile } from './editor/save.js';
import { syncEditorBuffer } from './editor/sync.js';
import { CaptureManager } from './capture-manager.js';
import { AgentCommunicationManager } from './agent/communication-manager.js';
import { messageBus } from './bus.js';
import { notify } from './notifications.js';
import { BrowserManager } from './browser/tab.js';
import { CommandManager } from './command-manager.js';
import { runSuggestion } from './monitor-window.js';
import { MonitorManager } from './monitor-manager.js';
import { listPersonas } from './personas.js';
import type { TabView } from './protocol.js';
import { TabManager } from './tab-manager.js';
import type { Managers } from './managers.js';

export class Controller {
  managers: Managers = {} as Managers;

  get rootDir(): string { return this.projectDir ?? process.cwd(); }

  constructor(private sinks: Sinks, private projectDir?: string) {
    this.managers.database = new DatabaseManager();
    this.managers.tab = new TabManager(this.managers, projectDir);
    this.managers.workspace = new WorkspaceManager(projectDir);
    this.managers.browser = new BrowserManager(this.managers);
    this.managers.acp = new AcpManager(this.managers);
    this.managers.openFile = new OpenFileManager(this.managers);
    this.managers.fileTree = new FileTreeManager(this.managers);
    this.managers.editorWatch = new EditorWatchManager(this.managers);
    this.managers.pty = new PseudoterminalManager(this.managers);
    this.managers.schedule = new ScheduleManager(this.managers);
    this.managers.shell = new ShellManager(this.managers);
    this.managers.harness = new HarnessManager(this.managers);
    this.managers.ssh = new SshManager(this.managers);
    this.managers.profile = new ProfileManager(this.managers);
    this.managers.connection = new ConnectionManager(this.managers);
    this.managers.communication = new AgentCommunicationManager(this.managers);
    this.managers.command = new CommandManager(this.managers);
    this.managers.capture = new CaptureManager(this.managers);
    this.managers.monitor = new MonitorManager(this.managers);
    
    messageBus.on('state', 'dirty', () => this.sinks.emitState());
    messageBus.on('transcript', 'entry:appended', (event) => {
      if (event.type !== 'entry:appended') return;
      this.managers.tab.persist(this.managers.tab.buildAgentState(event.tab, { schedule: this.managers.schedule.get(event.tab.label) }));
      // A cross-agent `msg`/`broadcast` delivery sets `entry.from`; feed the notifications tab
      // (focus suppression and the per-event toggle are enforced inside `notify`).
      if (event.entry.from) notify(this.managers, 'incoming-message', event.tabLabel, event.entry.from);
    });
    messageBus.on('app', 'exit', () => this.sinks.exit?.());
    messageBus.on('pty', ['data', 'exit'], (event) => {
      if (event.type === 'data') { this.sinks.sendPty(event.id, event.data); return; }
      if (event.type !== 'exit') return;
      const harnessIndex = this.managers.tab.tabs.findIndex((tab) => tab.harness?.ptyId === event.id);
      if (harnessIndex !== -1) {
        this.sinks.sendPtyExit(event.id, event.exitCode);
        this.managers.tab.closeTab(harnessIndex);
        return;
      }
      this.sinks.sendPtyExit(event.id, event.exitCode);
    });
    this.managers.schedule.start();
  }

  // Restore tabs from persisted agent state (for `--relaunch`). Called before any client connects.
  rehydrate(): void {
    this.managers.tab.rehydrate(
      (name) => TranscriptStore.load(name),
      (s) => { if (s.schedule) this.managers.schedule.set(s.name, s.schedule); },
    );
  }

  view(): TabView[] {
    return this.managers.tab.view(
      (l) => this.managers.connection.connectionsFor(l),
      (l) => this.managers.acp.label(l),
      (l) => this.managers.schedule.view(l),
    );
  }

  routeView(): { cmd: string; choices: string[] } | null {
    return this.managers.command.routeView();
  }

  chooseRoute(index: number): void {
    this.managers.command.chooseRoute(index);
  }

  dispatch(text: string): void {
    this.managers.command.dispatch(text);
  }

  // The absolute path behind an `/open/<id>` ref, or undefined when not registered (drives the route).
  openFilePath(id: string): string | undefined {
    return this.managers.tab.openFilePath(id);
  }

  // Write an editor tab's buffer back to disk (the `saveFile` RPC). Throws on error; the RPC
  // layer relays the message to the client.
  saveFile(url: string, content: string): void {
    saveFile(this.managers, url, content);
  }

  // Cache an editor tab's in-progress buffer as transient draft state (the `editorSync` RPC).
  // In-memory only; never written to disk.
  syncEditorBuffer(url: string, content: string): void {
    syncEditorBuffer(this.managers, url, content);
  }

  // --- monitor reporting tabs ------------------------------------------------

  runSuggestion(id: string): void {
    runSuggestion(this.managers, id);
  }

  rateSuggestion(id: string, up: boolean): void {
    this.managers.monitor.rate(id, up);
  }

  resetMonitorContext(name: string): void {
    this.managers.monitor.resetContext(name);
  }

  monitorContextSnapshot(name: string): void {
    this.managers.monitor.snapshotContext(name);
  }

  // --- inline terminal cards (PTY) -----------------------------------------

  ptyInput(id: string, data: string): void { this.managers.pty.input(id, data); }
  ptyResize(id: string, cols: number, rows: number): void { this.managers.pty.resizeOne(id, cols, rows); }
  ptyKill(id: string): void { this.managers.pty.kill(id); }
  resize(cols: number, rows: number): void { this.managers.pty.resize(cols, rows); }

  // --- tab management ------------------------------------------------------

  setActiveTab(index: number): void {
    this.managers.tab.setActiveTab(index);
  }

  moveTab(dir: -1 | 1): void {
    this.managers.tab.moveTab(dir);
  }

  reorderTab(dir: -1 | 1): void {
    this.managers.tab.reorderTab(dir);
  }

  closeTab(index: number): void {
    this.managers.tab.closeTab(index);
  }

  renameTab(index: number, title: string): void {
    this.managers.tab.renameTab(index, title);
  }

  editQueuedCommand(index: number, text: string): void {
    this.managers.tab.editQueued(this.managers.tab.cur().label, index, text);
  }

  deleteQueuedCommand(index: number): void {
    this.managers.tab.deleteQueued(this.managers.tab.cur().label, index);
  }

  toggleCollapse(): void {
    this.managers.tab.toggleCollapse();
  }

  // --- file tree tabs -------------------------------------------------------

  fileTreeToggle(index: number, path: string): void {
    const label = this.managers.tab.tabs[index]?.label;
    if (label) this.managers.fileTree.toggle(label, path);
  }

  fileTreeCollapseAll(index: number): void {
    const label = this.managers.tab.tabs[index]?.label;
    if (label) this.managers.fileTree.collapseAll(label);
  }

  fileTreeReroot(index: number, relPath?: string): void {
    const label = this.managers.tab.tabs[index]?.label;
    if (label) this.managers.fileTree.reroot(label, relPath);
  }

  // Dock/undock any dockable tab (file tree or notifications). The mechanism is view-agnostic —
  // `TabManager.setDock` operates on any tab index — so both kinds share this one handler.
  setDock(index: number, dock: 'left' | 'right' | null): void {
    this.managers.tab.setDock(index, dock);
  }

  // Tab-completion for the command line (reuses the shared `completeCommandLine`): filesystem
  // paths against the active tab's cwd, `msg`/`broadcast` agent names, `connection close` targets,
  // and `browser` subcommands / window ids.
  complete(text: string, cursor: number): CompletionResult {
    const tab = this.managers.tab.cur();
    const cwd = this.managers.tab.cwdOf(tab.label) ?? process.cwd();
    const agents = this.managers.tab.allLabels();
    // Monitor targets: every other action tab, plus `group:<n>` for each existing group.
    const actionTabs = this.managers.tab.tabs.filter((t) => t.view !== 'monitor');
    const groups = [...new Set(actionTabs.map((t) => t.group))].toSorted((a, b) => a - b).map((g) => `group:${g}`);
    const targets = [...actionTabs.map((t) => t.label).filter((l) => l !== tab.label), ...groups];
    return completeCommandLine(
      text, cursor, cwd, agents, this.managers.connection.completionConnections(tab.label),
      { personas: listPersonas(), targets },
    );
  }

  // Canonical connection strings for `connection close` completion (shell/acp/browser/sqlite).
  private completionConnections(label: string): string[] {
    return this.managers.connection.completionConnections(label);
  }

  shutdown(): void {
    this.managers.fileTree.dispose();
    this.managers.editorWatch.dispose();
    this.managers.monitor.closeAll();
    messageBus.clear();
    this.managers.schedule.stop();
    this.managers.shell.closeAll();
    this.managers.acp.closeAll();
    this.managers.pty.closeAll();
    this.managers.browser.closeAll();
    this.managers.database.closeAll();
    this.managers.workspace.removeAll();
  }
}
