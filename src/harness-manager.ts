import type { Tab, HarnessView } from './types.js';
import { makeHarnessTab, distinctColor } from './tab.js';
import { parseHarnessCommand, HARNESS_COMMANDS } from './harness.js';

// The controller capabilities the harness manager needs. Harness tabs are PTY-backed tabs that live
// in the controller's shared tab/PTY state, so the manager decides *what* to open and delegates the
// tab-array and PTY mechanics back through these hooks (mirrors how AgentBus is wired).
export type HarnessHost = {
  // All open tabs — for color avoidance, numbering, and label uniqueness.
  tabs: () => Tab[];
  // The tab a new harness joins (the active tab): supplies its group and working directory.
  creator: () => Tab;
  // A tab's working directory, or undefined if it has none yet.
  cwdOf: (label: string) => string | undefined;
  // Create (and track) a `--workspace` clone named after the harness tab. Returns the new directory,
  // or an `{ error }` to surface when there's no repo / the clone fails.
  createWorkspace: (name: string) => { dir: string } | { error: string };
  // Insert the built tab next to the creator's group and focus it.
  openTab: (tab: Tab) => void;
  // Spawn the harness program's PTY in `cwd`, register it under `label`, attach its id to the tab's
  // harness payload, and re-render.
  startPty: (label: string, program: string, cwd: string) => void;
};

// Owns harness command handling: launching a harness `<name>` as a PTY-backed tab (optionally in a
// fresh `--workspace` git clone) and naming it uniquely. The controller owns the shared tab and PTY
// state; this module owns the harness-specific decisions and wiring.
export class HarnessManager {
  constructor(private host: HarnessHost) {}

  // Handle a `harness <name> [--workspace]` command. Returns an error message to surface in the
  // creator's transcript, or undefined once the harness tab has been opened.
  run(input: string): string | undefined {
    const parsed = parseHarnessCommand(input);
    if ('error' in parsed) return parsed.error;
    return this.open(parsed.name, parsed.workspace);
  }

  // Open (and focus) a harness tab running `name`. With `workspace`, the harness starts in a fresh
  // `git clone --shared` of the repo detected from cwd; otherwise it inherits the creator's cwd.
  private open(name: string, workspace: boolean): string | undefined {
    const creator = this.host.creator();
    const program = HARNESS_COMMANDS[name];
    const label = this.uniqueLabel(name);

    const cwd = this.resolveCwd(workspace, label, creator);
    if (typeof cwd !== 'string') return cwd.error;

    const dotColor = distinctColor(this.host.tabs().map((t) => t.dotColor));
    const group = creator?.group ?? 1;
    const groupColor = creator?.groupColor ?? dotColor;
    const harness: HarnessView = { name, program, ptyId: '', status: 'running' };
    const tab = makeHarnessTab(label, dotColor, this.host.tabs().length + 1, group, groupColor, harness);
    this.host.openTab(tab);
    this.host.startPty(label, program, cwd);
    return undefined;
  }

  // The harness's starting directory: a new workspace clone (with `--workspace`) or the creator's
  // cwd. Returns the directory, or an `{ error }` to surface when there's no repo or the clone fails.
  private resolveCwd(workspace: boolean, label: string, creator: Tab): string | { error: string } {
    if (!workspace) return this.host.cwdOf(creator.label) ?? process.cwd();
    const result = this.host.createWorkspace(label);
    return 'error' in result ? result : result.dir;
  }

  // A unique internal label for a new harness tab: `claude`, `claude-2`, … The displayed title is the
  // name only; only the internal label is disambiguated so several harness tabs can coexist.
  private uniqueLabel(name: string): string {
    const used = new Set(this.host.tabs().map((t) => t.label));
    if (!used.has(name)) return name;
    let n = 2;
    while (used.has(`${name}-${n}`)) n++;
    return `${name}-${n}`;
  }
}
