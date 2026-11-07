import type { DirtyTabHandle } from '../shared/tab/handles';
import type { PluginTabStateStore } from './tab-state-store';

export function disposeClosedPluginTabs(
  openLabels: ReadonlySet<string>,
  handles: Map<string, DirtyTabHandle>,
  stateStore: PluginTabStateStore,
): void {
  stateStore.disposeClosedTabs(openLabels);
  for (const label of handles.keys()) {
    if (!openLabels.has(label)) handles.delete(label);
  }
}

export function retainOpenDirtyPluginLabels(
  openLabels: ReadonlySet<string>,
  dirtyLabels: ReadonlySet<string>,
): ReadonlySet<string> {
  const retained = new Set<string>();
  for (const label of dirtyLabels) {
    if (openLabels.has(label)) retained.add(label);
  }
  return retained.size === dirtyLabels.size ? dirtyLabels : retained;
}
