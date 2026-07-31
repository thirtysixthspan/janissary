import { lstatSync } from 'node:fs';
import path from 'node:path';

// Path helpers shared by `batch.ts` (move/delete) and `paste.ts` (copy/cut-paste) — extracted so
// neither module has to duplicate them, and to keep `batch.ts` under the file-size limit.

export function containedPath(root: string, relPath: string): string | undefined {
  if (!relPath || relPath === '.' || relPath === '..' || path.isAbsolute(relPath)) return;
  const absolute = path.resolve(root, relPath);
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return;
  return absolute;
}

export function realDirectory(root: string, relPath: string): string | undefined {
  const absolute = relPath === '' ? path.resolve(root) : containedPath(root, relPath);
  if (!absolute) return;
  try {
    const stat = lstatSync(absolute);
    return stat.isDirectory() && !stat.isSymbolicLink() ? absolute : undefined;
  } catch {
    return;
  }
}

export function exists(absolute: string): boolean {
  try {
    lstatSync(absolute);
    return true;
  } catch {
    return false;
  }
}

type NamedSource = { rel: string; valid: boolean };

export function duplicateNames(sources: NamedSource[]): Set<string> {
  const counts = new Map<string, number>();
  for (const source of sources) {
    if (source.valid) counts.set(path.basename(source.rel), (counts.get(path.basename(source.rel)) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
}
