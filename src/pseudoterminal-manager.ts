import { spawnPty, type PtySession } from './pty.js';
import { messageBus } from './bus.js';
import { getGithubToken } from './github-token.js';
import type { Managers } from './managers.js';

// Owns the live PTY sessions (keyed by their id) backing harness tabs, full-tab interactive command
// takeovers, and inline terminal cards, plus the dimensions new PTYs are spawned at. The controller
// owns the tabs these PTYs belong to; this module owns the sessions and their I/O, handing
// tab-affecting events back through the host.
export class PseudoterminalManager {
  private ptys = new Map<string, { session: PtySession; tabLabel: string }>();
  private cols = 80;
  private rows = 24;

  constructor(private managers: Managers) {}

  // Spawn a PTY running `command` (with `program` as its display label) in `cwd`, register it under
  // the owning tab's `label`, and return its id. Output and exit route back through the host.
  // `workspaceDir`/`offline`, when the owning tab is workspaced, confine the process via Seatbelt.
  spawn(label: string, program: string, command: string, cwd: string, workspaceDir?: string, offline?: boolean): string {
    const session = spawnPty(program, command, cwd, {
      onData: (id, data) => messageBus.emit('pty', { type: 'data', id, data }),
      onExit: (id, exitCode) => this.handleExit(id, exitCode),
    }, this.cols, this.rows, { workspaceDir, offline, githubToken: workspaceDir ? getGithubToken() : undefined });
    this.ptys.set(session.id, { session, tabLabel: label });
    return session.id;
  }

  // Forward client keystrokes to a PTY.
  input(id: string, data: string): void { this.ptys.get(id)?.session.write(data); }

  // Resize a single PTY (a client viewport change) and mirror the new size onto the bus so
  // server-side observers (the harness screen reader) track the real PTY's dimensions.
  resizeOne(id: string, cols: number, rows: number): void {
    const entry = this.ptys.get(id);
    if (!entry) return;
    entry.session.resize(cols, rows);
    messageBus.emit('pty', { type: 'resize', id, cols, rows });
  }

  // Kill a single PTY; its exit then flows through `handleExit`.
  kill(id: string): void { this.ptys.get(id)?.session.kill(); }

  // Set the dimensions new PTYs spawn at (the client's terminal size).
  resize(cols: number, rows: number): void { this.cols = cols; this.rows = rows; }

  // The dimensions new PTYs spawn at, for observers that mirror a PTY's screen.
  spawnDimensions(): { cols: number; rows: number } { return { cols: this.cols, rows: this.rows }; }

  // The program names of a tab's live PTYs, for the connections panel and completion (`terminal:<program>`).
  terminalsFor(label: string): string[] {
    const programs: string[] = [];
    for (const [, entry] of this.ptys) if (entry.tabLabel === label) programs.push(entry.session.program);
    return programs;
  }

  // Create an inline terminal card: spawn a PTY running `command` in the tab's cwd and attach its
  // id to `tab.activePty` so the client renders a terminal widget in the transcript. A workspaced
  // tab's own `workspaceDir`/`offline` carry over to inline PTYs (e.g. `shell vim` inside it).
  openInlinePty(label: string, command: string, program: string): void {
    const cwd = this.managers.tab.cwdOf(label) ?? process.cwd();
    const tab = this.managers.tab.tabs.find((t) => t.label === label);
    const id = this.spawn(label, program, command, cwd, tab?.workspaceDir, tab?.offline);
    for (const t of this.managers.tab.tabs) {
      if (t.label === label) { t.activePty = id; break; }
    }
    messageBus.emit('state', { type: 'dirty' });
  }

  // Kill and forget every PTY belonging to a tab (on tab close).
  closeTab(label: string): void {
    for (const [id, entry] of this.ptys) if (entry.tabLabel === label) { entry.session.kill(); this.ptys.delete(id); }
  }

  // Kill every PTY (app shutdown).
  closeAll(): void {
    for (const [, entry] of this.ptys) entry.session.kill();
    this.ptys.clear();
  }

  // Drop the exited PTY from the registry, clear `activePty` on full-tab takeovers, update inline
  // terminal card entries, then let the controller handle harness updates and client notification.
  private handleExit(id: string, exitCode: number): void {
    const hadEntry = this.ptys.delete(id);

    // Clear activePty for full-tab interactive PTY takeovers.
    for (const tab of this.managers.tab.tabs) {
      if (tab.activePty === id) tab.activePty = undefined;
    }

    // Update inline terminal card status in the log.
    if (hadEntry) {
      for (const tab of this.managers.tab.tabs) {
        const index = tab.log.findIndex((e) => e.terminal?.ptyId === id);
        if (index !== -1) {
          const log = [...tab.log];
          log[index] = { ...log[index], terminal: { ...log[index].terminal!, status: 'exited', exitCode } };
          tab.log = log;
          this.managers.tab.persist(this.managers.tab.buildAgentState(tab));
          messageBus.emit('transcript', { type: 'entry:appended', tabLabel: tab.label, entry: log[index], tab });
        }
      }
    }

    messageBus.emit('pty', { type: 'exit', id, exitCode });
    messageBus.emit('state', { type: 'dirty' });
  }
}
