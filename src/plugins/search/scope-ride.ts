import type { TabPluginServerCapabilities } from '../api.js';
import type { SearchScope } from './scope.js';

const INSTANCE_KEY = 'search';

type RideCapabilities = Pick<TabPluginServerCapabilities, 'joinRemoteWorkspace' | 'releaseRemoteWorkspace'>;

export type ScopeEntry = { scope: SearchScope; joinFailed: boolean };

// Move the search tab's channel from `previous` to `target`. One tab holds one channel entry, so the
// old one is released before the new one is joined. When the join fails the tab keeps `previous`,
// which for a remote scope means riding it again; a previous workspace that cannot be rejoined is no
// longer reachable either, and the tab falls back to the launch directory.
export function enterScope(
  target: SearchScope, previous: SearchScope, capabilities: RideCapabilities,
): ScopeEntry {
  capabilities.releaseRemoteWorkspace(INSTANCE_KEY);
  if (target.kind !== 'remote') return { scope: target, joinFailed: false };
  if (capabilities.joinRemoteWorkspace(INSTANCE_KEY, target.ride)) return { scope: target, joinFailed: false };
  if (previous.kind !== 'remote') return { scope: previous, joinFailed: true };
  if (capabilities.joinRemoteWorkspace(INSTANCE_KEY, previous.ride)) return { scope: previous, joinFailed: true };
  return { scope: { kind: 'launch' }, joinFailed: true };
}
