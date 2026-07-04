import { makeHarnessTab, distinctColor, uniqueLabel } from './tab.js';
import { parseHarnessCommand, HARNESS_COMMANDS } from './harness.js';
import type { Tab, HarnessView } from './types.js';
import { messageBus } from './bus.js';
import type { Managers } from './managers.js';

// Owns harness command handling: launching a harness `<name>` as a PTY-backed tab (optionally in a
// fresh `--workspace` git clone, and optionally under a custom `as <label>`) and naming it uniquely.
// The controller owns the shared tab and PTY state; this module owns the harness-specific decisions
// and wiring.
export class HarnessManager {
  constructor(private managers: Managers) {}

  // Handle a `harness <name> [as <label>] [--workspace]` command. Returns an error message to
  // surface in the creator's transcript, or undefined once the harness tab has been opened.
  run(input: string): string | undefined {
    const parsed = parseHarnessCommand(input);
    if ('error' in parsed) return parsed.error;
    return this.open(parsed.name, parsed.workspace, parsed.label);
  }

  // Open (and focus) a harness tab running `name`, labeled `label` if given (otherwise `name`).
  // With `workspace`, the harness starts in a fresh `git clone --shared` of the repo detected
  // from cwd; otherwise it inherits the creator's cwd.
  private open(name: string, workspace: boolean, label_?: string): string | undefined {
    const creator = this.managers.tab.cur();
    const program = HARNESS_COMMANDS[name];
    const label = uniqueLabel(this.managers.tab.tabs, label_ ?? name);

    const resolved = this.resolveCwd(workspace, label, creator);
    if (typeof resolved !== 'string' && 'error' in resolved) return resolved.error;
    const cwd = typeof resolved === 'string' ? resolved : resolved.dir;
    const workspaceDir = typeof resolved === 'string' ? undefined : resolved.dir;

    const dotColor = distinctColor(this.managers.tab.tabs.map((t) => t.dotColor));
    const group = creator?.group ?? 1;
    const groupColor = creator?.groupColor ?? dotColor;
    const harness: HarnessView = { name, program, ptyId: '', status: 'running' };
    const tab = makeHarnessTab(label, dotColor, this.managers.tab.tabs.length + 1, group, groupColor, harness, workspaceDir);
    this.managers.tab.insertTabInGroup(tab);
    this.managers.tab.activeTab = this.managers.tab.findIndex(tab.label);
    const id = this.managers.pty.spawn(label, program, program, cwd);
    const liveTab = this.managers.tab.tabs.find((t) => t.label === label);
    if (liveTab?.harness) liveTab.harness.ptyId = id;
    messageBus.emit('state', { type: 'dirty' });
    return undefined;
  }

  // The harness's starting directory: a new workspace clone (with `--workspace`) or the creator's
  // cwd. Returns the directory, or an `{ error }` to surface when there's no repo or the clone fails.
  // A workspace clone is returned as `{ dir }` (not a bare string) so the caller can tell it apart
  // from the creator's cwd and record it on the tab for cleanup on close.
  private resolveCwd(workspace: boolean, label: string, creator: Tab): string | { dir: string } | { error: string } {
    if (!workspace) return this.managers.tab.cwdOf(creator.label) ?? process.cwd();
    return this.managers.workspace.create(label);
  }
}
