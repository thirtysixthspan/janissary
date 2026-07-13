import { makeHarnessTab, distinctColor, uniqueLabel } from './tab/index.js';
import { parseSshCommand } from './ssh.js';
import type { HarnessView } from './types.js';
import { messageBus } from './bus.js';
import type { Managers } from './managers.js';

// Owns the `ssh <destination> [options…]` command: launching a real `ssh` session as a
// full-tab PTY (reusing the harness-view tab shape, `HarnessView.destination` set). Mirrors
// `HarnessManager` — same tab creation, focus, and PTY-spawn flow — but with no `as`/`--workspace`
// clauses (both would collide with ssh's own argument grammar).
export class SshManager {
  constructor(private managers: Managers) {}

  // Handle an `ssh <destination> [options…]` command. Returns an error message to surface in
  // the creator's transcript, or undefined once the ssh tab has been opened.
  run(input: string): string | undefined {
    const parsed = parseSshCommand(input);
    if ('error' in parsed) return parsed.error;
    return this.open(parsed.command, parsed.destination, parsed.label);
  }

  // Open (and focus) an ssh tab labeled after the destination's host, running `command`
  // (the verbatim `ssh …` invocation) in the creator's cwd.
  private open(command: string, destination: string, label_: string): string | undefined {
    const creator = this.managers.tab.cur();
    const label = uniqueLabel(this.managers.tab.tabs, label_);
    const cwd = this.managers.tab.cwdOf(creator.label) ?? process.cwd();

    const dotColor = distinctColor(this.managers.tab.tabs.map((t) => t.dotColor));
    const group = creator?.group ?? 1;
    const groupColor = creator?.groupColor ?? dotColor;
    const harness: HarnessView = { name: 'ssh', program: 'ssh', ptyId: '', status: 'running', destination };
    const tab = makeHarnessTab(label, dotColor, this.managers.tab.tabs.length + 1, group, groupColor, harness);
    this.managers.tab.insertTabInGroup(tab);
    this.managers.tab.activeTab = this.managers.tab.findIndex(tab.label);
    const id = this.managers.pty.spawn(label, 'ssh', command, cwd);
    const liveTab = this.managers.tab.tabs.find((t) => t.label === label);
    if (liveTab?.harness) liveTab.harness.ptyId = id;
    messageBus.emit('state', { type: 'dirty' });
    return undefined;
  }
}
