import type { ShellHookClaim } from '@shared/plugins/shell/shared';
import type { TabPluginClientCapabilities } from '../api';

export async function claimShellHooks(
  capabilities: TabPluginClientCapabilities, nonce: string,
): Promise<ShellHookClaim> {
  try {
    return await capabilities.intent<ShellHookClaim>('install-hooks', nonce);
  } catch (error) {
    capabilities.reportFailure('shell install-hooks intent failed');
    throw error;
  }
}
