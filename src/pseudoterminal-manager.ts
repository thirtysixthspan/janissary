import { spawnPty, type PtySession } from './pty.js';

// Callbacks into the controller for PTY events the manager can't resolve on its own: forwarding
// output to the client, and reacting to an exit (which touches the owning tab and the client, state
// the manager doesn't own).
export type PtyHost = {
  // Forward a chunk of PTY output to the client.
  onData: (id: string, data: string) => void;
  // A PTY exited. `hadEntry` is whether it was still registered (false when it was already torn down
  // via a tab close / explicit kill). The controller updates the owning tab and notifies the client.
  onExit: (id: string, exitCode: number, hadEntry: boolean) => void;
};

// Owns the live PTY sessions (keyed by their id) backing harness tabs, full-tab interactive command
// takeovers, and inline terminal cards, plus the dimensions new PTYs are spawned at. The controller
// owns the tabs these PTYs belong to; this module owns the sessions and their I/O, handing
// tab-affecting events back through the host.
export class PseudoterminalManager {
  private ptys = new Map<string, { session: PtySession; tabLabel: string }>();
  private cols = 80;
  private rows = 24;

  constructor(private host: PtyHost) {}

  // Spawn a PTY running `command` (with `program` as its display label) in `cwd`, register it under
  // the owning tab's `label`, and return its id. Output and exit route back through the host.
  spawn(label: string, program: string, command: string, cwd: string): string {
    const session = spawnPty(program, command, cwd, {
      onData: (id, data) => this.host.onData(id, data),
      onExit: (id, exitCode) => this.handleExit(id, exitCode),
    }, this.cols, this.rows);
    this.ptys.set(session.id, { session, tabLabel: label });
    return session.id;
  }

  // Forward client keystrokes to a PTY.
  input(id: string, data: string): void { this.ptys.get(id)?.session.write(data); }

  // Resize a single PTY (a client viewport change).
  resizeOne(id: string, cols: number, rows: number): void { this.ptys.get(id)?.session.resize(cols, rows); }

  // Kill a single PTY; its exit then flows through `handleExit`.
  kill(id: string): void { this.ptys.get(id)?.session.kill(); }

  // Set the dimensions new PTYs spawn at (the client's terminal size).
  resize(cols: number, rows: number): void { this.cols = cols; this.rows = rows; }

  // The program names of a tab's live PTYs, for the connections panel and completion (`terminal:<program>`).
  terminalsFor(label: string): string[] {
    const programs: string[] = [];
    for (const [, entry] of this.ptys) if (entry.tabLabel === label) programs.push(entry.session.program);
    return programs;
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

  // Drop the exited PTY from the registry, then let the controller update the owning tab and notify
  // the client. `Map.delete` reports whether it was still registered (false if already torn down).
  private handleExit(id: string, exitCode: number): void {
    const hadEntry = this.ptys.delete(id);
    this.host.onExit(id, exitCode, hadEntry);
  }
}
