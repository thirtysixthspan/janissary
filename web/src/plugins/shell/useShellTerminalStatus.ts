import { useEffect } from 'react';
import type { TabPluginClientCapabilities } from '../api';
import { reportShellIntentFailure } from './report-shell-intent-failure';

export function useShellTerminalStatus(capabilities: TabPluginClientCapabilities, ptyId: string | undefined) {
  useEffect(() => {
    if (!ptyId) return;
    // A shell that died while no browser was attached left this tab holding its payload with no way to
    // hear about it: the exit event went to nobody, and a plugin tab is in-memory only. Asking on mount
    // is what keeps such a tab from waiting for input that can never arrive.
    let cancelled = false;
    void capabilities.intent<{ ptyId: string; running: boolean }>('terminal-status', { ptyId }).then((status) => {
      if (!cancelled && status.ptyId === ptyId && !status.running) capabilities.close({ terminalExited: ptyId });
    }).catch((error: unknown) => {
      if (!cancelled) {
        reportShellIntentFailure(capabilities, 'shell terminal-status intent failed', error);
      }
    });
    return () => { cancelled = true; };
  }, [capabilities, ptyId]);
}
