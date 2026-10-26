import path from 'node:path';
import type { Managers } from '../../managers.js';
import type { RemoteTarget } from '../../tab/types.js';

export type MovedPath = { from: string; to: string };

export function pathsMoved(
  managers: Managers, state: { root: string; remote?: RemoteTarget }, pairs: MovedPath[],
): void {
  if (state.remote) return;
  for (const pair of pairs) {
    const from = path.resolve(state.root, pair.from);
    const to = path.resolve(state.root, pair.to);
    managers.tab.retargetEditorTab(from, to);
  }
}
