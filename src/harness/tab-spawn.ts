import { makeHarnessTab } from '../tab/index.js';
import { HARNESS_COMMANDS, buildHarnessCommand } from './index.js';
import { harnessSpawnEnv } from './scratch-dir.js';
import { reportBrowserGone } from './browser-gone.js';
import { autoApproveWithoutWorkspaceWarning } from './auto-approve.js';
import { harnessRuntime } from './observers.js';
import { HarnessRuntimes } from './runtime-registry.js';
import type { SpawnTabOptions } from './spawn-options.js';
import type { HarnessView } from '../tab/types.js';
import { messageBus } from '../bus.js';
import { sandboxNotice } from '../sandbox/index.js';
import { wireProvisioning } from '../workspace/provision-wire.js';
import { failHarnessSpawn, startRemoteTab } from './remote-launch.js';
import type { Managers } from '../managers.js';

// Creating the harness tab and giving it a PTY: the half of a launch that touches the tab, PTY and
// runtime registries, as opposed to the half that decides what to launch and what to call it. It
// carries the runtime registry with it because `finishSpawn` installs into it, and the manager's
// own screen/tailer lookups read the same registry.

export class HarnessTabSpawn {
  protected readonly runtimes = new HarnessRuntimes();

  constructor(protected readonly managers: Managers) {}

  // Shared core: create the harness tab and focus it. With no `ready` (no workspace, or a
  // workspace already provisioned by the caller), the PTY spawns immediately, exactly as before —
  // `spawnPty` runs synchronously. With `ready` (a `-w` launch's clone still in flight), the tab
  // is inserted immediately as an empty, `provisioning` placeholder with no PTY, and the PTY spawn
  // is deferred until `ready` resolves (see `finishSpawn`/`failSpawn`), so the tab never blocks on
  // the clone. `model`/`effort`, when given, are passed to the harness binary via
  // `buildHarnessCommand`.
  protected spawnTab(options: SpawnTabOptions): void {
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
      startRemoteTab(this.managers, options, remote, (remoteCwd, notice) => this.finishSpawn({ ...options, cwd: remoteCwd }, notice));
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
      (message, error) => { failHarnessSpawn(this.managers, options, message, error); },
    );
  }

  // Spawn the PTY and wire up its screen reader/recorder — the part of tab creation that actually
  // depends on `cwd` existing on disk, so it can't run until a `-w` launch's clone has finished.
  // For a remote tab the PTY is a session on the other host and `remoteNotice` is that host's own
  // isolation notice; everything downstream of the spawn is identical either way.
  protected finishSpawn(
    options: SpawnTabOptions,
    remoteNotice?: string,
  ): void {
    const { name, label, cwd, workspaceDir, offline, autoApprove, browser, model, effort, remote } = options;
    const program = HARNESS_COMMANDS[name];
    const command = buildHarnessCommand(name, model, effort);
    const channel = remote ? this.managers.remote.get(label) : undefined;
    // A remote tab starts nothing locally: the remote builds its own guard, child, and workspace on
    // the far side from the `browser` flag on the spawn frame.
    const spawnEnv = channel
      ? { env: undefined, handle: undefined }
      : harnessSpawnEnv({
        name, cwd, label, browser,
        onBrowserGone: (message, log) => reportBrowserGone(this.managers, label, message, log),
      });
    // Until the runtime owns the handle, nothing else will ever close it: a throw from the PTY
    // spawn or the runtime construction would otherwise strand a fully started browser.
    try {
      const id = channel
        ? this.managers.pty.registerRemotePty(label, channel, { program, command, harness: name, offline, browser, autoApprove }, options.resumePtyId)
        : this.managers.pty.spawn(label, program, command, cwd, workspaceDir, offline, spawnEnv.env);
      this.runtimes.install(id, label, harnessRuntime({ managers: this.managers, name, label, id, cwd, autoApprove, channel, browser: spawnEnv.handle }));
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
    const liveTab = this.managers.tab.harnessTab(label);
    if (!liveTab) return;
    liveTab.harness.ptyId = id;
    liveTab.harness.status = 'running';
  }
}
