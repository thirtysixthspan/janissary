import { realpathSync } from 'node:fs';
import path from 'node:path';
import { containedAbsolute, containedPath } from '../../file-navigator/batch-paths.js';

export function physicallyContainedPath(root: string, relPath: string): boolean {
  const absolute = containedPath(root, relPath);
  if (!absolute) return false;
  const realRoot = realpathSync(root);
  let candidate = absolute;

  while (true) {
    try {
      return containedAbsolute(realRoot, realpathSync(candidate));
    } catch {
      const parent = path.dirname(candidate);
      if (parent === candidate) return false;
      candidate = parent;
    }
  }
}
