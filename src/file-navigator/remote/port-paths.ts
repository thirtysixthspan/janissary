import path from 'node:path';

export class RemotePortPaths {
  constructor(private workspace: Promise<string>) {}

  async to(root: string, relPath: string): Promise<string> {
    return path.posix.relative(await this.workspace, path.posix.resolve(root, relPath));
  }

  async from(root: string, relPath: string): Promise<string> {
    const prefix = path.posix.relative(await this.workspace, root);
    return prefix ? path.posix.relative(prefix, relPath) : relPath;
  }

  async filterMatches(root: string, matches: string[]): Promise<string[]> {
    const prefix = path.posix.relative(await this.workspace, root);
    if (!prefix) return matches;
    return matches.filter((item) => item.startsWith(`${prefix}/`)).map((item) => item.slice(prefix.length + 1));
  }

  async filterEntries<T>(root: string, entries: [string, T][]): Promise<[string, T][]> {
    const prefix = path.posix.relative(await this.workspace, root);
    if (!prefix) return entries;
    return entries
      .filter(([item]) => item.startsWith(`${prefix}/`))
      .map(([item, value]) => [item.slice(prefix.length + 1), value]);
  }
}

export async function resolveRemoteWorkspace(ready: Promise<unknown>): Promise<string> {
  return String(await ready);
}
