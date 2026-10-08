import type { TabPluginClientCapabilities } from '../api';

const MISSING_TAB_PREFIX = 'Plugin tab "';
const MISSING_TAB_SUFFIX = '" not found';

function isMissingTabError(error: unknown): boolean {
  return error instanceof Error
    && error.message.startsWith(MISSING_TAB_PREFIX)
    && error.message.endsWith(MISSING_TAB_SUFFIX);
}

export function reportShellIntentFailure(
  capabilities: Pick<TabPluginClientCapabilities, 'reportFailure'>,
  reason: string,
  error: unknown,
): void {
  if (isMissingTabError(error)) return;
  capabilities.reportFailure(reason);
}
