// One remote session's directory watchers: the path -> listener sets `RemoteFileSystemPort` keeps
// while its channel is open. Split out of the port class to keep it under the file-size limit —
// see `ai/guidelines/code-guidelines.md`.
export class RemotePortWatchers {
  private watchers = new Map<string, Set<() => void>>();

  listen(path: string, onChange: () => void): void {
    const listeners = this.watchers.get(path) ?? new Set();
    listeners.add(onChange);
    this.watchers.set(path, listeners);
  }

  // Removes one listener and reports whether it was the path's last — the caller sends `unwatch`
  // on the channel only when it was.
  forget(path: string, listener: () => void): boolean {
    const listeners = this.watchers.get(path);
    listeners?.delete(listener);
    if ((listeners?.size ?? 0) > 0) return false;
    this.watchers.delete(path);
    return true;
  }

  emit(path: string): void {
    const listeners = this.watchers.get(path) ?? [];
    for (const listener of listeners) listener();
  }

  clear(): void {
    this.watchers.clear();
  }
}
