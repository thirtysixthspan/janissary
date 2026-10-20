import type { TabActivityEntry, TabPluginServerCapabilities } from '../api.js';
import type { SearchScope } from './scope.js';

type GoneQuestions = Pick<TabPluginServerCapabilities, 'originTab' | 'workspaceTracked'>;

// Whether the workspace a search tab is scoped to has gone away. A local clone is gone once the host
// stops tracking it; the search tab does not hold it. A remote scope is gone when the search tab's
// own riding record says so — its channel was dropped or its session ended. An offline or
// provisioning workspace is not gone.
export function scopeGone(
  scope: SearchScope, rows: readonly TabActivityEntry[], capabilities: GoneQuestions,
): boolean {
  if (scope.kind === 'launch') return false;
  if (scope.kind === 'local') return !capabilities.workspaceTracked(scope.dir);
  const own = rows.find((row) => row.plugin?.id === 'search' && row.plugin.instanceKey === 'search');
  if (own === undefined) return false;
  return capabilities.originTab(own.label)?.workspace?.gone === true;
}
