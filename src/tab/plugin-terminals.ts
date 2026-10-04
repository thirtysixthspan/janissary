import type { PseudoterminalManager } from '../pseudoterminal-manager.js';
import { SHELL_NAME, shellName } from '../shell/manager.js';
import type { TabPluginTerminal, TabPluginTerminalOptions } from '../plugins/api.js';
import { isInsideRoot } from '../plugins/files.js';

// The terminal a plugin tab owns, and the bound that terminal may not cross. Split out of `TabManager`
// so the three terminal methods are one module rather than three interruptions in a file that is
// otherwise about tabs: this is the only place in the host where a plugin's own options turn into a
// process, and it is the only place a plugin reaches one.
//
// `pty` and `launchDir` arrive per call rather than being captured at construction, because
// `managers.pty` is assigned after the tab manager is built.

export function spawnPluginTerminal(
  pty: PseudoterminalManager,
  launchDir: string,
  options: TabPluginTerminalOptions,
): TabPluginTerminal {
  // The bound `openInEditor` already places on a plugin's path, measured against the same field, so
  // the two file-shaped resources and this one refuse a directory outside the project root by one rule
  // rather than three. It throws rather than returning false: the caller is a payload factory whose
  // only way to report a problem is to fail, and `withResources` turns that into no tab.
  if (!isInsideRoot(launchDir, options.cwd)) {
    throw new Error(`refused to start a terminal in ${options.cwd}: outside the project root ${launchDir}`);
  }
  const workspace = options.workspace;
  const ptyId = pty.spawn(
    '',
    options.shell ? shellName(options.shell) : SHELL_NAME,
    '',
    options.cwd,
    workspace?.dir,
    workspace?.offline,
    undefined,
    // An absent `args` means the shell itself here, not a command run through it. This resource has
    // no command to run — the caller's business is the shell — and forwarding `undefined` would let
    // `spawnPty` fall back to `shellCommandArgs` with the empty command it was given, producing an
    // interactive shell whose one command is the empty string.
    { shell: options.shell, args: options.args ?? [] },
  );
  return { ptyId, ...pty.spawnDimensions(), running: pty.isRunning(ptyId) };
}