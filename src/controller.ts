import { HarnessManager } from './harness-manager.js';
import { DatabaseManager } from './database-manager.js';
import { AcpManager } from './acp-manager.js';
import { ShellManager } from './shell-manager.js';
import { WorkspaceManager } from './workspace-manager.js';
import { completeCommandLine } from './completion.js';
import type { CompletionResult, Sinks } from './types.js';
import { PseudoterminalManager } from './pseudoterminal-manager.js';
import { TranscriptStore } from './transcript/store.js';
import { ScheduleManager } from './schedule-manager.js';
import { ProfileManager } from './profile-manager.js';
import { ConnectionManager } from './connection-manager.js';
import { OpenFileManager } from './open-file-manager.js';
import { CaptureManager } from './capture-manager.js';
import { AgentCommunicationManager } from './agent-communication-manager.js';
import { messageBus } from './bus.js';
import { BrowserManager } from './browser-tab.js';
import { CommandManager } from './command-manager.js';
import type { TabView } from './protocol.js';
import { TabManager } from './tab-manager.js';
import type { Managers } from './managers.js';

export class Controller {
  managers: Managers = {} as Managers;

  constructor(private sinks: Sinks) {
    this.managers.database = new DatabaseManager();
    this.managers.tab = new TabManager(this.managers);
    this.managers.workspace = new WorkspaceManager();
    this.managers.browser = new BrowserManager(this.managers);
    this.managers.acp = new AcpManager(this.managers);
    this.managers.openFile = new OpenFileManager(this.managers);
    this.managers.pty = new PseudoterminalManager(this.managers);
    this.managers.schedule = new ScheduleManager(this.managers);
    this.managers.shell = new ShellManager(this.managers);
    this.managers.harness = new HarnessManager(this.managers);
    this.managers.profile = new ProfileManager(this.managers);
    this.managers.connection = new ConnectionManager(this.managers);
    this.managers.communication = new AgentCommunicationManager(this.managers);
    this.managers.command = new CommandManager(this.managers);
    this.managers.capture = new CaptureManager(this.managers);
    
    messageBus.on('state', 'dirty', () => this.sinks.emitState());
    messageBus.on('transcript', 'entry:appended', (event) => {
      if (event.type !== 'entry:appended') return;
      this.managers.tab.persist(this.managers.tab.buildAgentState(event.tab, { schedule: this.managers.schedule.get(event.tab.label) }));
    });
    messageBus.on('app', 'exit', () => this.sinks.exit?.());
    messageBus.on('pty', ['data', 'exit'], (event) => {
      if (event.type === 'data') { this.sinks.sendPty(event.id, event.data); return; }
      for (const tab of this.managers.tab.tabs) {
        if (tab.harness?.ptyId === event.id) {
          tab.harness = { ...tab.harness, status: 'exited', exitCode: event.exitCode };
        }
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

  toggleCollapse(): void {
    this.managers.tab.toggleCollapse();
  }

  // Tab-completion for the command line (reuses the shared `completeCommandLine`): filesystem
  // paths against the active tab's cwd, `msg`/`broadcast` agent names, `connection close` targets,
  // and `browser` subcommands / window ids.
  complete(text: string, cursor: number): CompletionResult {
    const tab = this.managers.tab.cur();
    const cwd = this.managers.tab.cwdOf(tab.label) ?? process.cwd();
    const agents = this.managers.tab.allLabels();
    return completeCommandLine(text, cursor, cwd, agents, this.managers.connection.completionConnections(tab.label));
  }

  // Canonical connection strings for `connection close` completion (shell/acp/browser/sqlite).
  private completionConnections(label: string): string[] {
    return this.managers.connection.completionConnections(label);
  }

  shutdown(): void {
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
