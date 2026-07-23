function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`).replaceAll('*', '[^/]*');
  return new RegExp(`^${escaped}$`);
}

function matchesSyncPath(relative: string, pattern: string): boolean {
  if (pattern.endsWith('/')) return relative === pattern.slice(0, -1) || relative.startsWith(pattern);
  if (pattern.includes('*')) return globToRegExp(pattern).test(relative);
  return relative === pattern;
}

// Whether `relative` (a project-relative, POSIX-separated file path) is covered by any entry in
// `syncPaths` — exact file paths, trailing-slash directory prefixes, or single-segment `*` globs.
export function isSyncedPath(relative: string, syncPaths: string[]): boolean {
  return syncPaths.some((pattern) => matchesSyncPath(relative, pattern));
}
