import path from 'node:path';

export function remoteFileNavigatorRoot(root: string, workspace: string): string | undefined {
  if (!workspace) return undefined;
  const normalizedRoot = path.posix.normalize(root);
  const normalizedWorkspace = path.posix.normalize(workspace);
  const relative = path.posix.relative(normalizedWorkspace, normalizedRoot);
  if (relative === '..' || relative.startsWith('../') || path.posix.isAbsolute(relative)) return undefined;
  if (relative === '') return '$root/';
  return `$workspace/${path.posix.basename(normalizedWorkspace)}/${relative}`;
}
