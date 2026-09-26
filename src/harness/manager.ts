import { distinctColor } from '../tab/index.js';
import { resolveLocalLaunchName, LAUNCH_REFUSED } from '../launch-name/local.js';
import { parseHarnessCommand, HARNESS_NAMES } from './index.js';
import type { HarnessLaunch } from './command-parse.js';
import { resolveLaunchDir } from './launch-dir.js';
import { isKnownModel, modelsFor } from './models.js';
import type { HarnessLaunchView } from '../protocol.js';
import type { ScreenCapture } from './screen.js';
import { supportsHarnessAutoApprove } from './auto-approve.js';
import { sshRuntime } from './observers.js';
import { HarnessTabSpawn } from './tab-spawn.js';
import type { SpawnTabOptions } from './spawn-options.js';
import { captureSubcommand, transcriptSubcommand } from './subcommands.js';
import type { HarnessTranscriptTailer } from './transcript/tailer.js';
import type { Tab } from '../tab/types.js';
import type { ProfileHarnessEntry } from '../profile/types.js';
import { messageBus } from '../bus.js';
import { oneShotRunEntry } from '../profile/harness-schedule.js';
import { parseRemoteAddress } from '../remote/address.js';

// Owns harness command handling: launching a harness `<name>` as a PTY-backed tab (optionally in a
// fresh `--workspace` git clone, and optionally under a custom `as <label>`) and naming it uniquely.
// The controller owns the shared tab and PTY state; this module owns the harness-specific decisions
// and wiring, and `HarnessTabSpawn` owns the tab creation itself.
export class HarnessManager extends HarnessTabSpawn {
  private launchDialogOpen = false;

  dispose(): void {
    this.runtimes.dispose();
  }

  // Release the closing tab's runtimes: its screen reader, recorder, transcript tailer, and e2e
  // browser. Part of the tab-close walk, so a remote harness whose PTY never reports an exit (a
  // detach) still stops recording and polling when its tab goes.
  closeTab(label: string): void {
    this.runtimes.closeTab(label);
  }

  // The named harness tab's most recent rendered-screen capture, or undefined when the tab is
  // missing, is not a harness tab, or has no capture yet. Exposes the screen reader's rendered
  // text (the coherent, de-ANSI'd form) to monitors without exposing the reader map.
  latestScreenText(label: string): ScreenCapture | undefined {
    const tab = this.managers.tab.harnessTab(label);
    if (!tab) return undefined;
    return this.runtimes.get(tab.harness.ptyId)?.reader?.latestCapture();
  }

  // The named tab's transcript tailer, or undefined when the tab is missing, is not a harness tab,
  // or never got one. Only `finishSpawn` creates a tailer, so this is also what tells a real harness
  // tab apart from an ssh tab — which carries the same harness-view shape and a `ptyId`, but runs no
  // harness binary and has no dot directory. Callers ask the tailer itself for entries or its file.
  transcriptTailer(label: string): HarnessTranscriptTailer | undefined {
    const tab = this.managers.tab.harnessTab(label);
    if (!tab) return undefined;
    return this.runtimes.get(tab.harness.ptyId)?.tailer;
  }

  // Register the observer pair for a PTY this manager did not spawn itself (currently: ssh tabs,
  // which reuse the harness-view tab shape but spawn their PTY directly via SshManager): a screen
  // reader, so the tab is monitorable, and a recorder, so the session is replayable after the tab
  // closes. `command` is the verbatim `ssh …` invocation, which the recording's header carries.
  registerSshObservers(id: string, label: string, command: string): void {
    this.runtimes.install(id, label, sshRuntime(this.managers, id, label, command));
  }

  // Handle a `harness <name> [as <label>] [-w] [--offline] [--model <name>] [--effort <level>]`
  // command. Returns an error message to surface in the creator's transcript, or undefined once
  // the harness tab has been opened.
  run(input: string): string | undefined {
    const parsed = parseHarnessCommand(input);
    if ('error' in parsed) return parsed.error;
    if ('capture' in parsed) return captureSubcommand(this.managers, (l) => this.latestScreenText(l), input, parsed.label);
    if ('transcript' in parsed) return transcriptSubcommand(this.managers, (l) => this.transcriptTailer(l), input, parsed.label);
    if (parsed.model && !isKnownModel(parsed.name, parsed.model)) {
      return `Unknown model "${parsed.model}" for harness "${parsed.name}" — add it to harness-models.json.`;
    }
    return this.open(parsed);
  }

  // Open the "New harness" launch dialog (bare `harness`). Held as a flag, mirroring
  // `CommandManager`'s `pendingRoute`; surfaced to the client via `harnessLaunchView()`.
  openLaunchDialog(): void {
    this.launchDialogOpen = true;
    messageBus.emit('state', { type: 'dirty' });
  }

  // Close the launch dialog (Cancel/Escape, or once a launch has been submitted).
  closeLaunchDialog(): void {
    this.launchDialogOpen = false;
    messageBus.emit('state', { type: 'dirty' });
  }

  // The launch dialog's catalog while open, or null when closed: the harness names and each
  // harness's known models, built fresh from `HARNESS_NAMES`/`modelsFor` so a project override of
  // `harness-models.json` is reflected.
  harnessLaunchView(): HarnessLaunchView | null {
    if (!this.launchDialogOpen) return null;
    const models = Object.fromEntries(HARNESS_NAMES.map((name) => [name, modelsFor(name)]));
    return { names: HARNESS_NAMES, models };
  }

  // Open (and focus) a harness tab running `name`, labeled `label` if given (otherwise `name`).
  // With `workspace`, the harness starts in a fresh clone of the `origin` remote of the repo
  // detected from cwd; otherwise it inherits the creator's cwd. With `remote`, no local clone is
  // made at all — the clone is provisioned by `janus remote-serve` on the named host. `retry` is set
  // when a remote host reported a default name running: the same launch, by the same creator, under
  // the next free name past every one already `tried`.
  private open(launch: HarnessLaunch, retry?: { creator: Tab; tried: readonly string[] }): string | undefined {
    const {
      name, workspace, offline, autoApprove, browser, label: label_, model, effort, prompt, remote,
    } = launch;
    const creator = retry?.creator ?? this.managers.tab.cur();
    const explicit = label_ !== undefined;
    const tried = retry?.tried ?? [];
    const label = resolveLocalLaunchName(this.managers, {
      creator: creator.label, name: label_ ?? name, explicit, workspace: workspace && !remote, skip: tried,
    });
    if (label === undefined) return undefined;
    const nameRetry = remote && {
      creator: creator.label, explicit, tried: [...tried, label],
      relaunch: (next: readonly string[]) => { this.open(launch, { creator, tried: next }); },
    };
    const fallbackCwd = this.managers.tab.cwdOf(creator.label) ?? process.cwd();

    const dir = resolveLaunchDir(this.managers, workspace && !remote, label, fallbackCwd);
    if (typeof dir === 'string') return dir;
    const { cwd, workspaceDir, ready } = dir;
    const dotColor = distinctColor(this.managers.tab.tabs.map((t) => t.dotColor));
    const group = creator?.group ?? 1;
    const groupColor = creator?.groupColor ?? dotColor;
    this.spawnTab({
      name, label, cwd, workspaceDir, offline, group, groupColor, dotColor, autoApprove, browser, model, effort, ready, remote,
      ...(nameRetry && { nameRetry }),
    });
    if (prompt) this.managers.schedule.set(label, [oneShotRunEntry('run-1', prompt)]);
    return undefined;
  }

  // Open a harness tab for a profile entry: unlike `open()`, the group/color come from the
  // profile launch (not the creator tab) and the starting directory comes from the entry's own
  // `cwd`/`workspace` (falling back to the issuing tab's cwd when the entry has neither). Returns
  // an error to report and skip on, or undefined once the tab is open. Never persisted — harness
  // tabs have no agent state. The entry's `name` is explicit, so a clash refuses the entry (posted
  // against `creator`, the issuing tab) rather than suffixing it.
  openFromProfile(
    entry: ProfileHarnessEntry, label: string, group: number, groupColor: string, creator: string,
  ): string | undefined {
    const remote = entry.remote === undefined ? undefined : parseRemoteAddress(entry.remote);
    if (remote && 'error' in remote) return remote.error;
    const unique = resolveLocalLaunchName(this.managers, {
      creator, name: label, explicit: true, workspace: (entry.workspace ?? true) && !remote,
    });
    if (unique === undefined) return LAUNCH_REFUSED;
    const dir = resolveLaunchDir(this.managers, (entry.workspace ?? true) && !remote, unique, entry.cwd ?? process.cwd());
    if (typeof dir === 'string') return dir;
    const { cwd, workspaceDir, ready } = dir;
    const dotColor = distinctColor(this.managers.tab.tabs.map((t) => t.dotColor), entry.dotColor);
    this.spawnTab({
      name: entry.tool, label: unique, cwd, workspaceDir, offline: entry.offline ?? false,
      group, groupColor, dotColor, autoApprove: entry.autoApprove ?? supportsHarnessAutoApprove(entry.tool),
      browser: entry.browser ?? false, model: entry.model, effort: entry.effort, ready, remote,
      ...(remote && { nameRetry: { creator, explicit: true, tried: [unique], relaunch: () => {} } }),
    });
    return undefined;
  }

  // Reopen a harness tab for a process already running on a peer being attached. Everything a
  // fresh `on <address>` launch does, with two facts carried in from the record: the channel asks to
  // attach rather than to provision, and the PTY adopts the spawn id the far side already knows
  // the harness by. No workspace is cloned — the one this tab had is still there.
  attachRemote(options: SpawnTabOptions): void { this.spawnTab(options); }
}
