import { basename } from '../shared/rel-path';

function splitPath(path: string): string[] {
  return path.replaceAll('\\', '/').split('/').filter(Boolean);
}

export function relativeNavigatorPath(
  absoluteRoot: string,
  sourcePath: string,
  targetCwd: string,
): string {
  const source = [...splitPath(absoluteRoot), ...splitPath(sourcePath)];
  const target = splitPath(targetCwd);
  let shared = 0;
  while (shared < source.length && shared < target.length && source[shared] === target[shared]) shared += 1;
  const parts = [...Array.from({ length: target.length - shared }, () => '..'), ...source.slice(shared)];
  return parts.join('/') || '.';
}

export function joinCommandPaths(
  absoluteRoot: string,
  sourcePaths: string[],
  targetCwd: string,
  remoteHost?: string,
): string {
  if (remoteHost) {
    return sourcePaths.map((path) => remoteNavigatorPath(remoteHost, absoluteRoot, path)).join(' ');
  }
  return sourcePaths.map((path) => relativeNavigatorPath(absoluteRoot, path, targetCwd)).join(' ');
}

// What tree rows look like when they land in a text buffer: tree-relative, one per line. An editor
// is not a command line, so a newline separates rather than submits, and the paths stay relative to
// the tree's own root rather than to any tab's working directory.
export function joinEditorPaths(
  absoluteRoot: string,
  sourcePaths: string[],
  remoteHost?: string,
): string {
  if (remoteHost) {
    return sourcePaths.map((path) => remoteNavigatorPath(remoteHost, absoluteRoot, path)).join('\n');
  }
  return sourcePaths.join('\n');
}

// What a tree row reads as when a drag drops it into text: just the row's own file name. A
// path would clutter the command line or the buffer; the tree's directory structure is not the
// drop's message. A remote tree keeps the host-qualified absolute form, since a bare name cannot
// be resolved against the remote host from the receiving side.
export function joinDropFileNames(
  absoluteRoot: string,
  sourcePaths: string[],
  remoteHost?: string,
  separator: ' ' | '\n' = ' ',
): string {
  if (remoteHost) {
    return sourcePaths.map((path) => remoteNavigatorPath(remoteHost, absoluteRoot, path)).join(separator);
  }
  return sourcePaths.map((path) => basename(path)).join(separator);
}

export function remoteNavigatorPath(host: string, absoluteRoot: string, sourcePath: string): string {
  const root = absoluteRoot.endsWith('/') ? absoluteRoot.slice(0, -1) : absoluteRoot;
  return `${host}:${root}/${sourcePath}`;
}
