import type { PseudoterminalManager } from '../pseudoterminal-manager.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import type { TabPluginTerminal, TabPluginTerminalOptions } from '../plugins/api.js';
import { TabPluginRejection } from '../plugins/api-capabilities.js';
import { SHELL_NAME, shellName } from '../shell/manager.js';
import { isZshHookNonce } from '../shell/zsh-startup/script.js';

export function spawnRemotePluginTerminal(
  pty: PseudoterminalManager,
  label: string,
  channel: RemoteChannel | undefined,
  options: TabPluginTerminalOptions,
): TabPluginTerminal {
  if (!channel) throw new TabPluginRejection(`Cannot start a remote terminal for ${label}: its remote channel is unavailable.`);
  if (options.zshHooks !== undefined && !isZshHookNonce(options.zshHooks.nonce)) {
    throw new TabPluginRejection('Cannot start a terminal with zsh hooks: the nonce is not 32 lowercase hex characters.');
  }
  let ptyId: string;
  try {
    const program = options.shell ? shellName(options.shell) : SHELL_NAME;
    ptyId = pty.registerRemotePty(label, channel, {
      program,
      command: program,
      cwd: options.cwd,
      offline: options.workspace?.offline,
      launch: {
        shell: options.zshHooks === undefined ? options.shell : options.shell ?? 'zsh',
        args: options.args ?? [],
      },
      env: options.env,
      ...(options.zshHooks && { shell: { nonce: options.zshHooks.nonce } }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n', 1)[0] : String(error);
    throw new TabPluginRejection(`Cannot start a remote terminal in ${options.cwd}: ${message}.`);
  }
  return { ptyId, ...pty.spawnDimensions(), running: pty.isRunning(ptyId) };
}
