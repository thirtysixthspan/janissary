import { useEffect } from 'react';
import type { TabPluginClientCapabilities } from '../api';

export function useShellTerminalStatus(capabilities: TabPluginClientCapabilities) {
  useEffect(() => {
    // A shell that died while no browser was attached left this tab holding its payload with no way to
    // hear about it: the exit event went to nobody, and a plugin tab is in-memory only. Asking on mount
    // is what keeps such a tab from waiting for input that can never arrive.
    let cancelled = false;
    // `null` and not `undefined`: the request is serialized with `JSON.stringify`, which drops a key
    // whose value is `undefined`, and the server's `pluginIntent` guard requires the key to be there.
    // An absent key is refused before the plugin is asked, so the one intent carrying no data would be
    // the one that never arrives. `isEmptyShellIntent` accepts both, so `null` is equally a valid
    // "nothing" on the far side.
    void capabilities.intent<{ running: boolean }>('terminal-status', null).then((status) => {
      if (!cancelled && !status.running) capabilities.close();
    }).catch(() => {
      // A refusal here means this plugin's own request is malformed or its plugin is disabled, not
      // anything the user did. Reporting it crosses the failure boundary instead of leaving an
      // unhandled rejection in the console on every mount.
      if (!cancelled) capabilities.reportFailure('shell terminal-status intent failed');
    });
    return () => { cancelled = true; };
  }, [capabilities]);
}
