// Maps opaque numeric IDs to absolute file paths, so a URL like `/open/3` can be handed to a
// client without exposing the real filesystem path. Counter is monotonic for the manager's
// lifetime; IDs are never reused even after the underlying tab closes.
export class FileRegistry {
  private files = new Map<string, string>();
  private counter = 0;

  register(absPath: string): string {
    const id = String(++this.counter);
    this.files.set(id, absPath);
    return `/open/${id}`;
  }

  get(id: string): string | undefined {
    return this.files.get(id);
  }

  // Exposes the backing map directly for `closeTabResources`, which deletes a closing tab's
  // entries in place rather than going through `register`/`get`.
  get map(): Map<string, string> {
    return this.files;
  }
}
