import path from 'node:path';
import { expandUserPath } from '../paths.js';
import type { Managers } from '../managers.js';

export type RemoteCwd = { cwd: string; label: string; workspace: string; home?: string };

export function remoteCwd(
  managers: Managers, sourceLabel: string, target: string, out: (text: string) => void, workspaceOverride?: string,
): RemoteCwd | undefined {
  const workspace = workspaceOverride ?? managers.remote?.workspaceOf(sourceLabel);
  if (workspace === undefined) {
    out('The remote workspace is not ready yet.');
    return undefined;
  }

  const normalizedWorkspace = path.posix.normalize(workspace);
  const remoteCwd = managers.tab.cwdOf(sourceLabel) ?? normalizedWorkspace;
  const relativeCwd = path.posix.relative(normalizedWorkspace, path.posix.normalize(remoteCwd));
  const base = relativeCwd === '' || (!relativeCwd.startsWith('../') && relativeCwd !== '..' && !path.posix.isAbsolute(relativeCwd))
    ? path.posix.normalize(remoteCwd)
    : normalizedWorkspace;
  if (target === '') return { cwd: base, label: sourceLabel, workspace: normalizedWorkspace };

  const home = managers.remote.homeOf(sourceLabel);
  const unknownHome = target.startsWith('~') && home === undefined;
  const expanded = unknownHome
    ? path.posix.resolve('/', target)
    : expandUserPath(target, { root: normalizedWorkspace, home });
  const resolved = path.posix.normalize(path.posix.isAbsolute(expanded) ? expanded : path.posix.join(base, expanded));
  const relative = path.posix.relative(normalizedWorkspace, resolved);
  if (relative === '..' || relative.startsWith('../') || path.posix.isAbsolute(relative)) {
    out(`"${resolved}" is outside the remote workspace ${normalizedWorkspace}.`);
    return undefined;
  }
  return { cwd: resolved, label: sourceLabel, workspace: normalizedWorkspace, ...(home !== undefined && { home }) };
}
