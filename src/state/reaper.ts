import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

// Deletes direct entries only: regular files whose names end with `extension` (case-sensitive) and
// whose mtime is strictly before `cutoffMs`. Subdirectories, symbolic links, and other entry types
// are never candidates, a failed read/stat/unlink is skipped silently, and the promise never rejects.
export async function reapFilesOlderThan(directory: string, extension: string, cutoffMs: number): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    // A missing or unreadable directory has nothing to reap.
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(extension)) continue;
    const filePath = path.join(directory, entry.name);
    try {
      const info = await stat(filePath);
      if (info.mtimeMs < cutoffMs) await unlink(filePath);
    } catch {
      // A failed stat or unlink skips that file without stopping the rest of the sweep.
    }
  }
}
