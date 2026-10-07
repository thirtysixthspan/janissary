import { realpathSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from '../../file-navigator/batch-paths.js';

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function physicallyContainedPath(root: string, relPath: string): boolean {
  const absolute = containedPath(root, relPath);
  if (!absolute) return false;
  const realRoot = realpathSync(root);
  let candidate = absolute;

  while (true) {
    try {
      return inside(realRoot, realpathSync(candidate));
    } catch {
      const parent = path.dirname(candidate);
      if (parent === candidate) return false;
      candidate = parent;
    }
  }
}
