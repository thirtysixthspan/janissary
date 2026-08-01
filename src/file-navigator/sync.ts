import type { Managers } from '../managers.js';
import type { FileNavigatorView } from '../types.js';
import type { FilesTabState } from './state.js';

type SyncStatus = NonNullable<FileNavigatorView['sync']>;

export function syncStatusForRoot(
  managers: Managers,
  root: string,
  current?: SyncStatus,
): SyncStatus | undefined {
  return managers.gitSync.isWorkspacePath(root) ? current ?? 'synced' : undefined;
}

export function resyncFileNavigator(
  managers: Managers,
  states: Map<string, FilesTabState>,
  label: string,
  rebuild: (label: string) => void,
  refreshGit: (label: string) => void,
): void {
  const state = states.get(label);
  if (!state || state.sync === 'syncing' || !managers.gitSync.isWorkspacePath(state.root)) return;
  const root = state.root;
  state.sync = 'syncing';
  rebuild(label);
  void managers.gitSync.openSync().then((result) => {
    const current = states.get(label);
    if (!current || current.root !== root) return;
    current.sync = 'error' in result ? 'error' : 'synced';
    rebuild(label);
    if (!('error' in result)) refreshGit(label);
  });
}
