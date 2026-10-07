import type { TabPluginResources } from '../api.js';
import { SHELL_PROGRAM, type ShellProvisioningPayload, type ShellTerminalPayload } from './shared.js';

// The one place a shell tab's zsh is started and its payload built, shared by a typed `zsh`, the
// ready handler that finishes a workspaced one, and a ➕ sibling.
//
// `spawnTerminal` is called inside a payload factory, because that factory is the only scope in which
// a plugin may start a process: a tab's label is allocated after the factory returns, and the host
// adopts the terminal onto the label it then mints.

export type ShellStart = {
  instanceKey: string;
  cwd: string;
  root: string;
  // The clone zsh is confined to. Absent, zsh runs unconfined wherever `cwd` says.
  workspace?: { dir: string; offline: boolean };
  // Minted with the shell, so its hooks are running before any browser attaches and every attach
  // reads the same nonce from the payload.
  hookNonce: string;
  host?: string;
  prompted?: boolean;
  recordedId?: string;
};

export function spawnShell(resources: TabPluginResources, start: ShellStart): ShellTerminalPayload {
  const { instanceKey, cwd, root, workspace, hookNonce, host, prompted, recordedId } = start;
  const terminal = resources.spawnTerminal({
    cwd,
    // The shell itself, with no argv at all — the one invocation in the application that does not
    // go through `shellCommandArgs`, which would otherwise run a single command through the shell.
    shell: SHELL_PROGRAM,
    args: [],
    // zsh's own startup installs the status hooks, from startup files the host owns (see
    // `src/shell/zsh-startup/script.ts`), so nothing is ever typed at its prompt and nothing reaches
    // its history.
    zshHooks: { nonce: hookNonce },
    ...(recordedId && { recordedId }),
    ...(workspace && { workspace }),
  });
  return {
    instanceKey,
    ptyId: terminal.ptyId,
    cwd,
    root,
    ...(workspace && { workspaceDir: workspace.dir }),
    workspace: workspace !== undefined,
    cols: terminal.cols,
    rows: terminal.rows,
    // Filled in by the host's first `hostState` push rather than read here: a plugin reaches no
    // host state of its own, and the windows only ever draw when they have rows.
    connections: [],
    schedule: [],
    hookNonce,
    ...(host && { host }),
    ...(prompted !== undefined && { prompted }),
  };
}

// What a workspaced shell shows while its clone lands: where it will start, and no terminal yet.
export function provisioningShell(start: ShellStart & { workspace?: { dir: string }; connectPtyId?: string }): ShellProvisioningPayload {
  return {
    instanceKey: start.instanceKey,
    provisioning: true,
    cwd: start.cwd,
    root: start.root,
    ...(start.workspace && { workspaceDir: start.workspace.dir }),
    workspace: true,
    connections: [],
    schedule: [],
    hookNonce: start.hookNonce,
    ...(start.connectPtyId && { connectPtyId: start.connectPtyId }),
    ...(start.host && { host: start.host }),
  };
}
