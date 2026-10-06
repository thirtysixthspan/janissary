import type { Terminal } from '@xterm/xterm';
import { readShellCwd, readShellMarker } from './shell-command-marker';

type MarkerCallbacks = {
  running: (running: boolean) => void;
  command: (command: string) => void;
  cwd: (cwd: string) => void;
};

// The hooks were installed by zsh's own startup, signed with the nonce the server minted with the
// shell and carried on the payload, so every attach trusts the same markers and types nothing.
export function registerShellMarkerHandlers(terminal: Terminal, nonce: string, callbacks: MarkerCallbacks): void {
  terminal.parser.registerOscHandler(133, (data) => {
    const marker = readShellMarker(data, nonce);
    switch (marker?.kind) {
    case 'C': {
      callbacks.running(true);
      if (marker.command !== undefined) callbacks.command(marker.command);
      break;
    }
    case 'D': { callbacks.running(false); break; }
    // Setup completes once per shell, before its first prompt, so this arrives once per terminal and
    // only to the attach that saw the shell start: clearing here removes what the startup files
    // printed, such as a warning about a history file the sandbox will not let zsh lock.
    case 'E': { terminal.clear(); break; }
    }
    // An unsigned C, D or E is ignored, but still consumed like a signed one.
    return ['C', 'D', 'E'].includes(data.split(';', 1)[0]);
  });
  terminal.parser.registerOscHandler(7, (data) => {
    const cwd = readShellCwd(data, nonce);
    if (cwd !== undefined) callbacks.cwd(cwd);
    return true;
  });
}
