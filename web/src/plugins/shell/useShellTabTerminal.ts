import type { ShellPayload } from '@shared/plugins/shell/shared';
import type { TabPluginClientCapabilities } from '../api';
import { useShellTerminal, type ShellTerminalHandle } from './useShellTerminal';
import { claimShellHooks } from './claim-shell-hooks';
import { reportShellCwd } from './report-shell-cwd';

type Options = {
  payload: ShellPayload;
  capabilities: TabPluginClientCapabilities;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onCommand: (command: string) => void;
  onCommandRunning: (running: boolean) => void;
};

// The tab's terminal, wired to the server through this plugin's intents: the hook install claim, the
// running state, and the directory zsh reports. `useShellTerminal` reads every callback through a
// ref, so none of these needs a stable identity.
export function useShellTabTerminal({
  payload, capabilities, containerRef, onCommand, onCommandRunning,
}: Options): ShellTerminalHandle {
  return useShellTerminal({
    ptyId: payload.ptyId,
    containerRef,
    attachTerminal: capabilities.attachTerminal,
    copyText: capabilities.copyText,
    hookNonce: payload.hookNonce,
    claimHooks: (nonce) => claimShellHooks(capabilities, nonce),
    onCommand,
    onCommandRunning: (running) => {
      onCommandRunning(running);
      void capabilities.intent<{ updated: boolean }>('command-state', { running }).catch(() => {
        capabilities.reportFailure('shell command status intent failed');
      });
    },
    onCwd: (cwd) => { reportShellCwd(capabilities, cwd); },
    // The tab closes when the shell exits: no exited state and no way to start another, so a closed
    // tab is the honest representation of a shell that is no longer running.
    onExit: () => { capabilities.close(); },
  });
}
