import { makeHarnessTab, distinctColor, uniqueLabel } from '../tab/index.js';
import { parseHarnessCommand, HARNESS_COMMANDS, HARNESS_NAMES, buildHarnessCommand } from './index.js';
import { harnessSpawnEnv } from './scratch-dir.js';
import { isKnownModel, modelsFor } from './models.js';
import type { HarnessLaunchView } from '../protocol.js';
import type { ScreenCapture } from './screen.js';
import { autoApproveWithoutWorkspaceWarning, supportsHarnessAutoApprove } from './auto-approve.js';
import { harnessRuntime, sshRuntime } from './observers.js';
import type { HarnessRuntime } from './runtime.js';
import type { SpawnTabOptions } from './spawn-options.js';
import { captureSubcommand, transcriptSubcommand } from './subcommands.js';
import type { HarnessTranscriptTailer } from './transcript/tailer.js';
import type { HarnessView } from '../tab/types.js';
import type { ProfileHarnessEntry } from '../profile/types.js';
import { messageBus, type Subscription } from '../bus.js';
import { notify } from '../notifications.js';
import { sandboxNotice } from '../sandbox/index.js';
import { oneShotRunEntry } from '../profile/harness-schedule.js';
import { wireProvisioning, PROVISION_FAILURE_CLOSE_DELAY_MS } from '../workspace/provision-wire.js';
import type { ProvisioningWorkspace } from '../workspace/manager.js';
import { startRemoteTab } from './remote-launch.js';
import { parseRemoteAddress, type RemoteAddress } from '../remote/address.js';
import type { Managers } from '../managers.js';

// Owns harness command handling: launching a harness `<name>` as a PTY-backed tab (optionally in a
// fresh `--workspace` git clone, and optionally under a custom `as <label>`) and naming it uniquely.
// The controller owns the shared tab and PTY state; this module owns the harness-specific decisions
// and wiring.
export class HarnessManager {
  private runtimes = new Map<string, HarnessRuntime>();
  private launchDialogOpen = false;
  private subscription: Subscription;

  constructor(private managers: Managers) {
    this.subscription = messageBus.on('pty', 'exit', (event) => {
      if (event.type !== 'exit') return;
      this.runtimes.get(event.id)?.dispose();
      this.runtimes.delete(event.id);
    });
  }

  dispose(): void {
    this.subscription.unsubscribe();
    for (const runtime of this.runtimes.values()) runtime.dispose();
    this.runtimes.clear();
  }

  // The named harness tab's most recent rendered-screen capture, or undefined when the tab is
  // missing, is not a harness tab, or has no capture yet. Exposes the screen reader's rendered
  // text (the coherent, de-ANSI'd form) to monitors without exposing the reader map.
  latestScreenText(label: string): ScreenCapture | undefined {
    const tab = this.managers.tab.tabs.find((t) => t.label === label);
    if (!tab?.harness) return undefined;
    return this.runtimes.get(tab.harness.ptyId)?.reader.latestCapture();
  }

  // The named tab's transcript tailer, or undefined when the tab is missing, is not a harness tab,
  // or never got one. Only `finishSpawn` creates a tailer, so this is also what tells a real harness
  // tab apart from an ssh tab — which carries the same harness-view shape and a `ptyId`, but runs no
  // harness binary and has no dot directory. Callers ask the tailer itself for entries or its file.
  transcriptTailer(label: string): HarnessTranscriptTailer | undefined {
    const tab = this.managers.tab.tabs.find((t) => t.label === label);
    if (!tab?.harness) return undefined;
    return this.runtimes.get(tab.harness.ptyId)?.tailer;
  }

  // Register the observer pair for a PTY this manager did not spawn itself (currently: ssh tabs,
  // which reuse the harness-view tab shape but spawn their PTY directly via SshManager): a screen
  // reader, so the tab is monitorable, and a recorder, so the session is replayable after the tab
  // closes. `command` is the verbatim `ssh …` invocation, which the recording's header carries.
  registerSshObservers(id: string, label: string, command: string): void {
    this.runtimes.set(id, sshRuntime(this.managers, id, label, command));
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
    return this.open(parsed.name, parsed.workspace, parsed.offline, parsed.autoApprove, parsed.browser, parsed.label, parsed.model, parsed.effort, parsed.prompt, parsed.remote);
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
  // made at all — the clone is provisioned by `janus remote-serve` on the named host.
  private open(
    name: string, workspace: boolean, offline: boolean, autoApprove: boolean, browser: boolean,
    label_?: string, model?: string, effort?: string, prompt?: string, remote?: RemoteAddress,
  ): string | undefined {
    const creator = this.managers.tab.cur();
    const label = uniqueLabel(this.managers.tab.tabs, label_ ?? name);
    const fallbackCwd = this.managers.tab.cwdOf(creator.label) ?? process.cwd();

    const dir = this.parseDir(this.resolveCwd(workspace && !remote, label, fallbackCwd));
    if (typeof dir === 'string') return dir;
    const { cwd, workspaceDir, ready } = dir;
    const dotColor = distinctColor(this.managers.tab.tabs.map((t) => t.dotColor));
    const group = creator?.group ?? 1;
    const groupColor = creator?.groupColor ?? dotColor;
    this.spawnTab({ name, label, cwd, workspaceDir, offline, group, groupColor, dotColor, autoApprove, browser, model, effort, ready, remote });
    if (prompt) this.managers.schedule.set(label, [oneShotRunEntry('run-1', prompt)]);
    return undefined;
  }

  // Open a harness tab for a profile entry: unlike `open()`, the group/color come from the
  // profile launch (not the creator tab) and the starting directory comes from the entry's own
  // `cwd`/`workspace` (falling back to the issuing tab's cwd when the entry has neither). Returns
  // an error to report and skip on, or undefined once the tab is open. Never persisted — harness
  // tabs have no agent state.
  openFromProfile(entry: ProfileHarnessEntry, label: string, group: number, groupColor: string): string | undefined {
    const unique = uniqueLabel(this.managers.tab.tabs, label);
    const remote = entry.remote === undefined ? undefined : parseRemoteAddress(entry.remote);
    if (remote && 'error' in remote) return remote.error;
    const dir = this.parseDir(this.resolveCwd((entry.workspace ?? true) && !remote, unique, entry.cwd ?? process.cwd()));
    if (typeof dir === 'string') return dir;
    const { cwd, workspaceDir, ready } = dir;
    const dotColor = distinctColor(this.managers.tab.tabs.map((t) => t.dotColor), entry.dotColor);
    this.spawnTab({
      name: entry.tool, label: unique, cwd, workspaceDir, offline: entry.offline ?? false,
      group, groupColor, dotColor, autoApprove: entry.autoApprove ?? supportsHarnessAutoApprove(entry.tool),
      browser: entry.browser ?? false, model: entry.model, effort: entry.effort, ready, remote,
    });
    return undefined;
  }

  // Shared core: create the harness tab and focus it. With no `ready` (no workspace, or a
  // workspace already provisioned by the caller), the PTY spawns immediately, exactly as before —
  // `spawnPty` runs synchronously. With `ready` (a `-w` launch's clone still in flight), the tab
  // is inserted immediately as an empty, `provisioning` placeholder with no PTY, and the PTY spawn
  // is deferred until `ready` resolves (see `finishSpawn`/`failSpawn`), so the tab never blocks on
  // the clone. `model`/`effort`, when given, are passed to the harness binary via
  // `buildHarnessCommand`.
  private spawnTab(options: SpawnTabOptions): void {
    const { name, label, cwd, workspaceDir, offline, group, groupColor, dotColor, autoApprove, model, effort, remote } = options;
    const provisioning = options.ready !== undefined || remote !== undefined;
    const harness: HarnessView = { name, program: HARNESS_COMMANDS[name], ptyId: '', status: provisioning ? 'provisioning' : 'running' };
    if (model !== undefined) harness.model = model;
    if (effort !== undefined) harness.effort = effort;
    const tab = makeHarnessTab(label, dotColor, this.managers.tab.tabs.length + 1, group, groupColor, harness, workspaceDir);
    tab.offline = offline;
    tab.autoApprove = autoApprove;
    tab.browser = options.browser;
    // Deliberately left with no `workspaceDir`: a remote tab's clone lives on the other host, and
    // `src/tab/cleanup.ts` reads that field to schedule a recursive delete of the *local* path.
    if (remote) tab.remote = { address: remote.address, host: remote.host };
    this.managers.tab.insertTabInGroup(tab);
    this.managers.tab.setCwd(label, cwd);
    this.managers.tab.addBusy(label);
    this.managers.tab.setActiveTab(this.managers.tab.findIndex(tab.label));

    if (remote) {
      startRemoteTab(
        this.managers, options, remote,
        (remoteCwd, notice) => this.finishSpawn({ ...options, cwd: remoteCwd }, notice),
        (message) => this.failSpawn(label, message),
      );
      return;
    }
    const ready = options.ready;
    if (!ready) {
      this.finishSpawn(options);
      return;
    }
    // Broadcast the placeholder now — its PTY isn't ready yet, but the tab itself is, and the
    // whole point is that this must not wait on the clone.
    messageBus.emit('state', { type: 'dirty' });
    wireProvisioning(
      label,
      ready,
      (l) => this.managers.tab.tabs.some((t) => t.label === l),
      () => this.finishSpawn(options),
      (message) => this.failSpawn(label, message),
    );
  }

  // Spawn the PTY and wire up its screen reader/recorder — the part of tab creation that actually
  // depends on `cwd` existing on disk, so it can't run until a `-w` launch's clone has finished.
  // For a remote tab the PTY is a session on the other host and `remoteNotice` is that host's own
  // isolation notice; everything downstream of the spawn is identical either way.
  private finishSpawn(
    { name, label, cwd, workspaceDir, offline, autoApprove, browser, model, effort, remote }: SpawnTabOptions,
    remoteNotice?: string,
  ): void {
    const program = HARNESS_COMMANDS[name];
    const command = buildHarnessCommand(name, model, effort);
    const channel = remote ? this.managers.remote.get(label) : undefined;
    // A remote tab starts nothing locally: the remote builds its own guard, child, and workspace on
    // the far side from the `browser` flag on the spawn frame.
    const spawnEnv = channel
      ? { env: undefined, handle: undefined }
      : harnessSpawnEnv({ name, cwd, label, browser, onBrowserGone: (message) => notify(this.managers, 'e2e-browser-gone', label, message) });
    // Until the runtime owns the handle, nothing else will ever close it: a throw from the PTY
    // spawn or the runtime construction would otherwise strand a fully started browser.
    try {
      const id = channel
        ? this.managers.pty.registerRemotePty(label, channel, { program, command, harness: name, offline, browser })
        : this.managers.pty.spawn(label, program, command, cwd, workspaceDir, offline, spawnEnv.env);
      this.runtimes.set(id, harnessRuntime({ managers: this.managers, name, label, id, cwd, autoApprove, channel, browser: spawnEnv.handle }));
      this.markRunning(label, id);
    } catch (error) {
      spawnEnv.handle?.close();
      throw error;
    }
    if (remote) this.managers.tab.setCwd(label, cwd);
    const notice = remote ? remoteNotice : (workspaceDir ? sandboxNotice() : autoApproveWithoutWorkspaceWarning(autoApprove));
    if (notice) this.managers.tab.append(label, { input: '', output: notice });
    messageBus.emit('state', { type: 'dirty' });
  }

  // Point the live tab at the PTY it just got. Inside `finishSpawn`'s ownership block, so a tab is
  // never left claiming to run a PTY whose runtime construction threw.
  private markRunning(label: string, id: string): void {
    const liveTab = this.managers.tab.tabs.find((t) => t.label === label);
    if (!liveTab?.harness) return;
    liveTab.harness.ptyId = id;
    liveTab.harness.status = 'running';
  }

  // A `-w` launch's workspace clone failed after the placeholder tab was already created: surface
  // the error in place of the empty placeholder, then close the tab shortly after so nothing is
  // left open in a broken state.
  private failSpawn(label: string, message: string): void {
    const tab = this.managers.tab.tabs.find((t) => t.label === label);
    if (tab?.harness) tab.harness.provisionError = message;
    messageBus.emit('state', { type: 'dirty' });
    setTimeout(() => {
      const index = this.managers.tab.findIndex(label);
      if (index !== -1) this.managers.tab.closeTab(index);
    }, PROVISION_FAILURE_CLOSE_DELAY_MS);
  }

  // Parse `resolveCwd`'s result into a clean `{ cwd, workspaceDir, ready }` or return the error
  // string. `ready` is only set for a workspace clone still in flight — its `cwd` is already the
  // clone's target directory (known synchronously, see `WorkspaceManager.create`), so the tab and
  // its cwd can be set up immediately without waiting for `ready` to resolve.
  private parseDir(
    resolved: string | ProvisioningWorkspace | { error: string },
  ): string | { cwd: string; workspaceDir: string | undefined; ready: Promise<void> | undefined } {
    if (typeof resolved !== 'string' && 'error' in resolved) return resolved.error;
    return {
      cwd: typeof resolved === 'string' ? resolved : resolved.dir,
      workspaceDir: typeof resolved === 'string' ? undefined : resolved.dir,
      ready: typeof resolved === 'string' ? undefined : resolved.ready,
    };
  }

  // The harness's starting directory: a new workspace clone (with `workspace`) or `fallbackCwd`.
  // Returns the directory, or an `{ error }` to surface when there's no repo or the remote can't
  // be read (both fail synchronously, before anything is cloned — see `WorkspaceManager.create`).
  // A workspace clone is returned as `{ dir, ready }` (not a bare string) so the caller can tell it
  // apart from the fallback cwd, record it on the tab for cleanup on close, and defer the PTY spawn
  // until `ready` resolves.
  private resolveCwd(workspace: boolean, label: string, fallbackCwd: string): string | ProvisioningWorkspace | { error: string } {
    if (!workspace) return fallbackCwd;
    return this.managers.workspace.create(label);
  }
}
