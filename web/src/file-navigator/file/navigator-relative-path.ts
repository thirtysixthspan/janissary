import { basename } from '../../shared/rel-path';

function withoutTrailingSlash(path: string): string {
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

// What a tree row reads as when it lands in a local harness terminal: anchored to the harness's own
// workspace as `$workspace/<clone-name>/…` when the file sits inside its clone, and otherwise to the
// tree's display root (`$root/…`, `~/…`). A remote tree keeps the host-qualified absolute form.
export function joinHarnessPaths(
  absoluteRoot: string,
  displayRoot: string,
  sourcePaths: string[],
  workspaceDir?: string,
  remoteHost?: string,
): string {
  if (remoteHost) {
    return sourcePaths.map((path) => remoteNavigatorPath(remoteHost, absoluteRoot, path)).join(' ');
  }
  const display = withoutTrailingSlash(displayRoot);
  const root = withoutTrailingSlash(absoluteRoot);
  const clone = workspaceDir === undefined ? undefined : withoutTrailingSlash(workspaceDir);
  return sourcePaths.map((path) => {
    const absolute = `${root}/${path}`;
    if (clone && absolute.startsWith(`${clone}/`)) {
      return `$workspace/${clone.split('/').at(-1) ?? ''}${absolute.slice(clone.length)}`;
    }
    return `${display}/${path}`;
  }).join(' ');
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
