import type { Terminal } from '@xterm/xterm';
import type { ShellHookClaim } from '@shared/plugins/shell/shared';
import type { PluginTerminal } from '../api';
import { readShellCwd, readShellMarker } from './shell-command-marker';
import { shellStatusHooks } from './shell-status-hooks';

export type ClaimShellHooks = (nonce: string) => Promise<ShellHookClaim>;

// The nonce the handlers trust, held in a box rather than closed over: an attach that loses the
// install claim learns the winner's nonce only after its handlers are registered.
export type ShellMarkerNonce = { current: string };

type MarkerCallbacks = {
  running: (running: boolean) => void;
  command: (command: string) => void;
  cwd: (cwd: string) => void;
};

export const SHELL_INITIALIZING = 'shell-initializing';

export function registerShellMarkerHandlers(
  terminal: Terminal, container: HTMLElement, nonce: ShellMarkerNonce, callbacks: MarkerCallbacks,
): void {
  terminal.parser.registerOscHandler(133, (data) => {
    const marker = readShellMarker(data, nonce.current);
    switch (marker?.kind) {
    case 'C': {
      callbacks.running(true);
      const setup = shellStatusHooks(nonce.current).trimEnd();
      if (marker.command !== undefined && marker.command !== setup) callbacks.command(marker.command);
      break;
    }
    case 'D': { callbacks.running(false); break; }
    // The setup line runs once per terminal, so this arrives once per terminal: clearing here removes
    // only the echoed setup line, whichever mount happens to be attached when it lands.
    case 'E': {
      terminal.clear();
      container.classList.remove(SHELL_INITIALIZING);
      break;
    }
    }
    // An unsigned C, D or E is ignored, but still consumed like a signed one.
    return ['C', 'D', 'E'].includes(data.split(';', 1)[0]);
  });
  terminal.parser.registerOscHandler(7, (data) => {
    const cwd = readShellCwd(data, nonce.current);
    if (cwd !== undefined) callbacks.cwd(cwd);
    return true;
  });
}

// Asks the server whether this attach is the one to install the hooks. A winning claim is written
// even if the tab unmounted while the answer was in flight: the server has already recorded the
// hooks as installed, so dropping the line would leave a shell whose markers nobody could ever read.
// The attachment's `write` only sends input, which still reaches the terminal after a detach.
export function installShellHooks(
  handle: PluginTerminal, container: HTMLElement, nonce: ShellMarkerNonce, claim: ClaimShellHooks,
): void {
  void claim(nonce.current).then((answer) => {
    nonce.current = answer.nonce;
    if (answer.install) handle.write(shellStatusHooks(answer.nonce));
    else container.classList.remove(SHELL_INITIALIZING);
  }).catch(() => { /* A refused claim is reported by the claimant, which disables the plugin. */ });
}
