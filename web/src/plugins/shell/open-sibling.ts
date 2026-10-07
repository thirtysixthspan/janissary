import type { TabPluginClientCapabilities } from '../api';

// ➕ and `Cmd+T`: ask for a shell beside this one. An `{ opened: false }` answer is a shell still
// waiting for its workspace, which opens nothing and is not a failure.
export function openSiblingShell(capabilities: TabPluginClientCapabilities): void {
  void capabilities.intent<{ opened: boolean }>('sibling', null).catch(() => {
    capabilities.reportFailure('shell sibling intent failed');
  });
}
