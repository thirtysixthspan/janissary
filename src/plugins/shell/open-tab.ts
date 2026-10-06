import type { TabPluginResources, TabPluginServerCapabilities } from '../api.js';
import { isInsideRoot } from '../files.js';
import { SHELL_PROGRAM, type ShellPayload } from './shared.js';
import type { ZshStartupDirectory } from './zsh-startup-directory.js';
import { createShellMarkerNonce, shellStartupEnvironment } from './zsh-startup-script.js';

// Opens one shell tab. Split out of `activate.ts` so that module holds the contract and nothing else:
// the instance-key counter, the declaration-shaped wiring, and the two handlers, with the tab-opening
// sequence — which tab asked, where the shell starts, and what the payload says — here.
//
// `spawnTerminal` is called inside the payload factory rather than beside `openOrFocusTab`, because
// that factory is the only scope in which a plugin may start a process: a tab's label is allocated
// after the factory returns, and the host adopts the terminal onto the label it then mints.

export function openShellTab(
  capabilities: TabPluginServerCapabilities,
  instanceKey: string,
  startup: ZshStartupDirectory,
): void {
  const origin = capabilities.originTab();
  if (!origin) return;
  if (origin.remote) capabilities.rejectRequest('A shell tab cannot be opened from a remote tab.');
  const workspace = origin.workspace;
  // A shell that has `cd`-ed out of the project leaves its tab recording a directory no terminal may
  // start in, so the new shell starts where its workspace or project does rather than not at all.
  // Judged with the host's own resolved containment check, so a directory the host's spawn bound
  // would refuse falls back here instead of reaching it.
  const allowed = isInsideRoot(origin.root, origin.cwd)
    || (workspace !== undefined && isInsideRoot(workspace.dir, origin.cwd));
  const cwd = allowed ? origin.cwd : workspace?.dir ?? origin.root;

  capabilities.openOrFocusTab(instanceKey, (resources: TabPluginResources) => {
    // Minted with the shell, so its hooks are running before any browser attaches and every attach
    // reads the same nonce from the payload.
    const hookNonce = createShellMarkerNonce();
    const terminal = resources.spawnTerminal({
      cwd,
      // The shell itself, with no argv at all — the one invocation in the application that does not
      // go through `shellCommandArgs`, which would otherwise run a single command through the shell.
      shell: SHELL_PROGRAM,
      args: [],
      // zsh's own startup installs the status hooks (see `zsh-startup-script.ts`), so nothing is ever
      // typed at its prompt and nothing reaches its history.
      env: shellStartupEnvironment(startup.path(), hookNonce, process.env.ZDOTDIR),
      ...(workspace && { workspace }),
    });
    const payload: ShellPayload = {
      instanceKey,
      ptyId: terminal.ptyId,
      cwd,
      root: origin.root,
      ...(workspace && { workspaceDir: workspace.dir }),
      workspace: workspace !== undefined,
      cols: terminal.cols,
      rows: terminal.rows,
      // Filled in by the host's first `hostState` push rather than read here: a plugin reaches no
      // host state of its own, and the windows only ever draw when they have rows.
      connections: [],
      schedule: [],
      hookNonce,
    };
    return { title: 'shell', payload };
  });
}
