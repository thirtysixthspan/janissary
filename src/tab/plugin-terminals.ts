import type { PseudoterminalManager } from '../pseudoterminal-manager.js';
import type { Tab } from './types.js';
import type { WorkspaceManager } from '../workspace/manager.js';
import { SHELL_NAME, shellName } from '../shell/manager.js';
import type { TabPluginTerminal, TabPluginTerminalOptions } from '../plugins/api.js';
import { TabPluginRejection } from '../plugins/api-capabilities.js';
import { isInsideRoot } from '../plugins/files.js';
import { errorFirstLine } from '../error-text.js';
import type { ZshStartupDirectory } from '../shell/zsh-startup/directory.js';
import { isZshHookNonce, shellStartupEnvironment } from '../shell/zsh-startup/script.js';

// The terminal a plugin tab owns, and the bound that terminal may not cross. Split out of `TabManager`
// so the three terminal methods are one module rather than three interruptions in a file that is
// otherwise about tabs: this is the only place in the host where a plugin's own options turn into a
// process, and it is the only place a plugin reaches one.
//
// `pty` and `launchDir` arrive per call rather than being captured at construction, because
// `managers.pty` is assigned after the tab manager is built.

export function ownsTerminal(
  tab: Pick<Tab, 'label' | 'view'>,
  pty: Pick<PseudoterminalManager, 'terminalIdFor'>,
): boolean {
  return tab.view === 'plugin' && pty.terminalIdFor(tab.label) !== undefined;
}

// A plugin tab that will own a terminal once its workspace clone lands — the same signal the
// metadata row's provisioning flag reads. `send` and `queue` accept it; `schedule` does not, because
// a schedule types into a terminal that does not exist yet.
export function awaitsTerminal(
  tab: Pick<Tab, 'view' | 'workspaceDir'>,
  workspace: Pick<WorkspaceManager, 'provisioning'>,
): boolean {
  return tab.view === 'plugin' && tab.workspaceDir !== undefined && workspace.provisioning(tab.workspaceDir);
}

// The plugin's environment, with zsh's startup environment over it when the plugin asked for the
// status hooks. The startup directory is created on the first such terminal, not before, so a session
// that never opens a shell tab never writes one.
function terminalEnvironment(
  options: TabPluginTerminalOptions,
  startup: ZshStartupDirectory,
): Record<string, string> | undefined {
  if (options.zshHooks === undefined) return options.env;
  return { ...options.env, ...shellStartupEnvironment(startup.path(), options.zshHooks.nonce, process.env.ZDOTDIR) };
}

export function spawnPluginTerminal(
  pty: PseudoterminalManager,
  launchDir: string,
  options: TabPluginTerminalOptions,
  startup: ZshStartupDirectory,
): TabPluginTerminal {
  // The bound `openInEditor` already places on a plugin's path, measured against the same field, so
  // the two file-shaped resources and this one refuse a directory outside the project root by one rule
  // rather than three. It throws rather than returning false: the caller is a payload factory whose
  // only way to report a problem is to fail, and `withResources` turns that into no tab.
  //
  // Both throws here are rejections, not failures. A directory the bound refuses, or one the process
  // cannot start in, is a bad request for one tab rather than a broken plugin, so the plugin stays
  // enabled and the terminals its other tabs own keep running. A plain error would cross the failure
  // boundary, disable the plugin, and close every one of them.
  if (!isInsideRoot(launchDir, options.cwd)) {
    throw new TabPluginRejection(`Cannot start a terminal in ${options.cwd}: it is outside the project root ${launchDir}.`);
  }
  // The nonce is written literally into the hook functions zsh runs, so a value of any other shape is
  // refused here rather than reaching them.
  if (options.zshHooks !== undefined && !isZshHookNonce(options.zshHooks.nonce)) {
    throw new TabPluginRejection('Cannot start a terminal with zsh hooks: the nonce is not 32 lowercase hex characters.');
  }
  const workspace = options.workspace;
  let ptyId: string;
  try {
    const env = terminalEnvironment(options, startup);
    ptyId = pty.spawn(
      '',
      options.shell ? shellName(options.shell) : SHELL_NAME,
      '',
      options.cwd,
      workspace?.dir,
      workspace?.offline,
      env,
      // An absent `args` means the shell itself here, not a command run through it. This resource has
      // no command to run — the caller's business is the shell — and forwarding `undefined` would let
      // `spawnPty` fall back to `shellCommandArgs` with the empty command it was given, producing an
      // interactive shell whose one command is the empty string.
      { shell: options.shell, args: options.args ?? [] },
    );
  } catch (error) {
    throw new TabPluginRejection(`Cannot start a terminal in ${options.cwd}: ${errorFirstLine(error)}.`);
  }
  return { ptyId, ...pty.spawnDimensions(), running: pty.isRunning(ptyId) };
}
