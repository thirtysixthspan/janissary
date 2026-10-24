import path from 'node:path';

// Whether a path sits inside a root: the one rule the file navigator, the remote filesystem, the
// serve process, the sandbox, agent skill and task resolution, and the plugin host all clamp with,
// kept outside every one of those features so none has to reach into another for it.
//
// Both sides are compared through `path.relative`, which resolves each against the process
// directory first, so a relative pair compares the same way an absolute pair does. A child whose
// name merely starts with `..` (`..notes`) is inside; only `..` itself or a `../` prefix escapes.

function insideRelative(relative: string): boolean {
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

// Whether an already-resolved absolute path sits inside `root` (the root itself counts).
export function containedAbsolute(root: string, absolute: string): boolean {
  const relative = path.relative(root, absolute);
  return relative === '' || insideRelative(relative);
}

// The same rule with the root itself excluded, for a caller asking about something strictly beneath
// it — a clone under the workspaces directory, a skill under the installed skills.
export function containedStrictly(root: string, absolute: string): boolean {
  const relative = path.relative(root, absolute);
  return relative !== '' && insideRelative(relative);
}

// `relPath` resolved against `root`, or nothing when it is empty, names the root, escapes it, or is
// absolute: the shape every navigator operation takes a client-supplied relative path in.
export function containedPath(root: string, relPath: string): string | undefined {
  if (!relPath || relPath === '.' || relPath === '..' || path.isAbsolute(relPath)) return;
  const absolute = path.resolve(root, relPath);
  return containedAbsolute(root, absolute) ? absolute : undefined;
}
