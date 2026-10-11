import { createHash, type Hash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import path from 'node:path';

function addNode(hash: Hash, absolute: string, name: string): void {
  const stat = lstatSync(absolute);
  hash.update(JSON.stringify([name, stat.dev, stat.ino, stat.mode]));
  if (stat.isSymbolicLink()) {
    hash.update(readlinkSync(absolute));
  } else if (stat.isDirectory()) {
    const children = readdirSync(absolute).toSorted((left, right) => left.localeCompare(right));
    for (const child of children) {
      addNode(hash, path.join(absolute, child), child);
    }
  } else if (stat.isFile()) {
    hash.update(readFileSync(absolute));
  } else {
    hash.update(JSON.stringify([stat.size, stat.mtimeMs, stat.ctimeMs]));
  }
}

// Combines filesystem identity with file content so both replacements and in-place edits diverge.
export function fileIdentity(absolute: string): string | undefined {
  const hash = createHash('sha256');
  try {
    addNode(hash, absolute, '');
    return hash.digest('hex');
  } catch {
    return undefined;
  }
}
