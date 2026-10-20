import type { TabPluginServerCapabilities } from '../api.js';
import { MAX_BYTES, type ScanOptions } from './scan.js';
import type { SearchScope } from './scope.js';

const INSTANCE_KEY = 'search';

type FileCapabilities = Pick<
  TabPluginServerCapabilities, 'projectFileList' | 'remoteWorkspaceFileList' | 'readRemoteWorkspaceFile'
>;

export type ScopeFileAccess = Pick<ScanOptions, 'listFiles' | 'readCandidate'>;

// How a scan of `scope` lists and reads its files. A remote workspace is listed on the far side and
// each candidate is read over the channel the search tab rides; a listing the channel cannot answer
// is an empty one. Local and launch scopes read from disk through the scan's own reader.
export function scopeFileAccess(scope: SearchScope, capabilities: FileCapabilities): ScopeFileAccess {
  if (scope.kind === 'remote') {
    return {
      listFiles: async () =>
        await capabilities.remoteWorkspaceFileList(INSTANCE_KEY) ?? { root: scope.dir, paths: [] },
      readCandidate: (_absPath, relPath) =>
        capabilities.readRemoteWorkspaceFile(INSTANCE_KEY, relPath, MAX_BYTES),
    };
  }
  if (scope.kind === 'local') return { listFiles: () => capabilities.projectFileList(scope.dir) };
  return { listFiles: () => capabilities.projectFileList() };
}
