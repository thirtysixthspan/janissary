import type { TabPluginServerCapabilities } from '../api.js';
import type { ScanOptions } from './scan.js';
import type { SearchScope } from './scope.js';
import type { SearchRequest } from '../../search/types.js';

const INSTANCE_KEY = 'search';

type FileCapabilities = Pick<TabPluginServerCapabilities, 'projectFileList' | 'remoteWorkspaceSearch'>;

export type ScopeFileAccess = Pick<ScanOptions, 'listFiles' | 'remoteSearch'>;

// Remote searches run on the workspace host. Local and launch scopes keep the local scan path.
export function scopeFileAccess(scope: SearchScope, capabilities: FileCapabilities): ScopeFileAccess {
  if (scope.kind === 'remote') {
    return {
      listFiles: async () => ({ root: scope.dir, paths: [] }),
      remoteSearch: (request: SearchRequest) => capabilities.remoteWorkspaceSearch(INSTANCE_KEY, request),
    };
  }
  if (scope.kind === 'local') return { listFiles: () => capabilities.projectFileList(scope.dir) };
  return { listFiles: () => capabilities.projectFileList() };
}
