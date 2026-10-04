import type { TabPluginClientCapabilities } from '../api';

export function reportShellCwd(capabilities: TabPluginClientCapabilities, cwd: string): void {
  void capabilities.intent<{ updated: boolean }>('cwd', cwd).catch(() => {
    capabilities.reportFailure('shell cwd intent failed');
  });
}
