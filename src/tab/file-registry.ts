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

  release(reference: string): void {
    releaseFileReference(this.files, reference);
  }

  replace(reference: string, absPath: string): string {
    this.release(reference);
    return this.register(absPath);
  }

  // Exposes the backing map for plugin resource cleanup, whose tracked references are raw IDs.
  get map(): Map<string, string> {
    return this.files;
  }
}

export function releaseFileReference(files: Map<string, string>, reference: string): void {
  const id = reference.startsWith('/open/') ? reference.slice('/open/'.length) : undefined;
  if (id) files.delete(id);
}
