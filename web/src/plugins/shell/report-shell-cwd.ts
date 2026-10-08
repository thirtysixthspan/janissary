import type { TabPluginClientCapabilities } from '../api';
import { reportShellIntentFailure } from './report-shell-intent-failure';

export function reportShellCwd(capabilities: TabPluginClientCapabilities, cwd: string): void {
  void capabilities.intent<{ updated: boolean }>('cwd', cwd).catch((error: unknown) => {
    reportShellIntentFailure(capabilities, 'shell cwd intent failed', error);
  });
}
