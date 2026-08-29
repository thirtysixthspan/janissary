function splitPath(path: string): string[] {
  return path.replaceAll('\\', '/').split('/').filter(Boolean);
}

export function relativeNavigatorPath(
  absoluteRoot: string,
  sourcePath: string,
  targetCwd: string,
): string {
  const source = [...splitPath(absoluteRoot), ...splitPath(sourcePath)];
  const target = splitPath(targetCwd);
  let shared = 0;
  while (shared < source.length && shared < target.length && source[shared] === target[shared]) shared += 1;
  const parts = [...Array.from({ length: target.length - shared }, () => '..'), ...source.slice(shared)];
  return parts.join('/') || '.';
}

export function joinCommandPaths(
  absoluteRoot: string,
  sourcePaths: string[],
  targetCwd: string,
  remoteHost?: string,
): string {
  if (remoteHost) {
    return sourcePaths.map((path) => remoteNavigatorPath(remoteHost, absoluteRoot, path)).join(' ');
  }
  return sourcePaths.map((path) => relativeNavigatorPath(absoluteRoot, path, targetCwd)).join(' ');
}

export function remoteNavigatorPath(host: string, absoluteRoot: string, sourcePath: string): string {
  const root = absoluteRoot.endsWith('/') ? absoluteRoot.slice(0, -1) : absoluteRoot;
  return `${host}:${root}/${sourcePath}`;
}
