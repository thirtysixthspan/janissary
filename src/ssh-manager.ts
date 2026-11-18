import { homedir } from 'node:os';
import { makeHarnessTab } from './tab/index.js';
import { distinctColor } from './tab/colors.js';
import { uniqueLabel } from './tab/utils.js';
import { parseSshCommand } from './ssh.js';
import { buildSavedSshInvocation, savedSshName } from './ssh-saved-host.js';
import { sameHostName } from './plugins/hosts/hosts-values.js';
import { readHostsFile } from './plugins/hosts/hosts-file.js';
import { notify } from './notifications/index.js';
import type { HarnessView } from './tab/types.js';
import { messageBus } from './bus.js';
import type { Managers } from './managers.js';

// Owns the `ssh <destination> [options…]` command: launching a real `ssh` session as a
// full-tab PTY (reusing the harness-view tab shape, `HarnessView.destination` set). Mirrors
// `HarnessManager` — same tab creation, focus, and PTY-spawn flow — but with no `as`/`--workspace`
// clauses (both would collide with ssh's own argument grammar).
export class SshManager {
  constructor(private managers: Managers) {}

  // Handle an `ssh <destination> [options…]` command. Returns an error message to surface in
  // the creator's transcript, or undefined once the ssh tab has been opened. A bare name that
  // matches the effective catalog wins over a literal host or ssh-config alias of the same
  // spelling; the catalog is read only for an input that can be a saved name.
  run(input: string, label?: string): string | undefined {
    const name = savedSshName(input);
    if (name !== undefined) {
      const creatorLabel = label ?? this.managers.tab.cur().label;
      const read = readHostsFile(this.managers.tab.launchDir ?? '', homedir(), (message) => {
        notify(this.managers, 'manual', creatorLabel, message);
      });
      const host = read.hosts.find((saved) => sameHostName(saved.name, name));
      if (host !== undefined) {
        const parsed = buildSavedSshInvocation(host);
        if ('error' in parsed) return parsed.error;
        return this.open(parsed.command, parsed.destination, parsed.label, parsed.options, host.name, label);
      }
      if (this.managers.tab.byLabel(creatorLabel)?.plugin?.id === 'hosts') {
        return `No host named "${name}".`;
      }
    }
    const parsed = parseSshCommand(input);
    if ('error' in parsed) return parsed.error;
    return this.open(parsed.command, parsed.destination, parsed.label, parsed.options, undefined, label);
  }

  // Open (and focus) an ssh tab labeled after the destination's host, running `command`
  // (the verbatim `ssh …` invocation) in the creator's cwd. A caller that names its execution
  // tab gets that tab as the creator, so group, group color and cwd follow the source even when
  // a different tab is active; callers that omit it keep the current-tab default.
  private open(
    command: string, destination: string, label_: string, options: string[],
    hostName: string | undefined, creatorLabel?: string,
  ): string | undefined {
    const creator = (creatorLabel === undefined ? undefined : this.managers.tab.byLabel(creatorLabel))
      ?? this.managers.tab.cur();
    const label = uniqueLabel(this.managers.tab.tabs, label_);
    const cwd = this.managers.tab.cwdOf(creator.label) ?? process.cwd();

    const dotColor = distinctColor(this.managers.tab.tabs.map((t) => t.dotColor));
    const group = creator?.group ?? 1;
    const groupColor = creator?.groupColor ?? dotColor;
    const harness: HarnessView = { name: 'ssh', program: 'ssh', ptyId: '', status: 'running', destination };
    if (hostName !== undefined) harness.hostName = hostName;
    if (options.length > 0) harness.sshOptions = options;
    const tab = makeHarnessTab(label, dotColor, this.managers.tab.tabs.length + 1, group, groupColor, harness);
    this.managers.tab.insertTabInGroup(tab);
    this.managers.tab.setActiveTab(this.managers.tab.findIndex(tab.label));
    const id = this.managers.pty.spawn(label, 'ssh', command, cwd);
    this.managers.terminalRuntime.registerSshObservers(id, label, command);
    const liveTab = this.managers.tab.byLabel(label);
    if (liveTab?.harness) liveTab.harness.ptyId = id;
    messageBus.emit('state', { type: 'dirty' });
    // The sessions list is composed partly from this manager's tabs, and nothing else moves when one
    // opens — so without this an open list, and above all a docked one that never regains focus and
    // so never re-reads on its own, would show the new connection only after a Refresh.
    messageBus.emit('sessions', { type: 'changed' });
    return undefined;
  }
}
