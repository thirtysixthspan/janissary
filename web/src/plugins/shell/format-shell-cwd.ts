function isAtOrBelow(path: string, directory: string): boolean {
  const base = directory.replace(/\/+$/u, '') || '/';
  return path === base || path.startsWith(`${base === '/' ? '' : base}/`);
}

export function formatShellCwd(cwd: string, root: string, workspaceDir?: string): string {
  if (workspaceDir && isAtOrBelow(cwd, workspaceDir)) {
    const directory = workspaceDir.replace(/\/+$/u, '');
    const name = directory.split('/').at(-1) ?? '';
    const remainder = cwd.slice(directory.length).replace(/^\/+/, '');
    return `$workspace/${name}${remainder ? `/${remainder}` : ''}`;
  }

  const rootDirectory = root.replace(/\/+$/u, '') || '/';
  if (cwd === rootDirectory) return '$root/';
  if (rootDirectory === '/' && cwd.startsWith('/')) return `$root${cwd}`;
  const stateDirectory = rootDirectory === '/' ? '/.janissary' : `${rootDirectory}/.janissary`;
  if (cwd === stateDirectory) return '$root/';
  if (isAtOrBelow(cwd, stateDirectory)) {
    return `$root${cwd.slice(stateDirectory.length)}`;
  }
  if (isAtOrBelow(cwd, rootDirectory)) return `$root${cwd.slice(rootDirectory.length)}`;
  return cwd;
}
