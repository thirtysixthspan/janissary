import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { errorText } from '../error-text.js';

// Path-keyed handles the browser owns privately. They never enter the name-keyed registry, so a
// database opened by absolute path stays out of `connections list`, the dropdown, and tab completion.
export class PathHandles {
  private readonly handles = new Map<string, DatabaseSync>();

  open(path: string): { handle: DatabaseSync } | { error: string } {
    if (!existsSync(path)) {
      return { error: `Database "${path}" does not exist. Create it to start.` };
    }
    const existing = this.handles.get(path);
    if (existing) return { handle: existing };
    try {
      const handle = new DatabaseSync(path);
      this.handles.set(path, handle);
      return { handle };
    } catch (error) {
      return { error: errorText(error) };
    }
  }

  close(): void {
    for (const handle of this.handles.values()) {
      try { handle.close(); } catch { /* ignore */ }
    }
    this.handles.clear();
  }
}
