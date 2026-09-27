import { homedir } from 'node:os';
import path from 'node:path';
import { normalizeWebUrl } from '../openers/web-target.js';

// What a source line names, decided from the string alone so the same answer comes out whether the
// line came from the command bar, a context-menu selection, or a stored record.
export type SourceRef =
  | { kind: 'url'; url: string }
  | { kind: 'file'; path: string };

// The directories a local source may be read from: the project the user is working in, and their own
// home. The first is where the files they point at overwhelmingly are; the second is where a saved
// visualization's own record lives, so a source written in one project has to keep working in the
// next. Anything else is refused by name, which is a far more useful message than "not found".
export type SourceRoots = { project: string; home: string };

export function defaultSourceRoots(project: string): SourceRoots {
  return { project, home: homedir() };
}

// The scheme rules are the ones `open <url>` and the page plugin already apply, so a source that
// `open` would refuse to fetch is refused here for the same stated reason rather than by a second set
// of opinions. A bare host is an https URL; anything else with a scheme is refused.
export function parseSource(raw: string, roots: SourceRoots): SourceRef | { error: string } {
  const line = raw.trim();
  if (line === '') return { error: 'empty source' };
  if (line.startsWith('/') || line.startsWith('~') || line.startsWith('.')) {
    return fileWithin(line, roots);
  }
  const normalized = normalizeWebUrl(line);
  if ('error' in normalized) return normalized;
  return { kind: 'url', url: normalized.url };
}

// The path is expanded and resolved before it is compared, never after. A `..` traversal, a `~` that
// expands elsewhere, and a symlink pointing out of the root all resolve to a path that is not inside
// it, and comparing the resolved path is what catches all three — a check on the literal string would
// pass the first two and fail the third.
function fileWithin(line: string, roots: SourceRoots): SourceRef | { error: string } {
  const expanded = line === '~' || line.startsWith('~/')
    ? path.join(roots.home, line.slice(1))
    : line;
  const resolved = path.resolve(roots.project, expanded);
  const home = path.resolve(roots.home);
  if (within(resolved, path.resolve(roots.project)) || within(resolved, home)) {
    return { kind: 'file', path: resolved };
  }
  return {
    error: `${line} is outside the project directory and your home directory, and a data source may only be read from one of those`,
  };
}

// A prefix comparison has to be on a path boundary, or `/home/alice-backup` would count as inside
// `/home/alice`. The separator is appended to the root so the comparison is on whole segments.
function within(candidate: string, root: string): boolean {
  const base = root.endsWith(path.sep) ? root : root + path.sep;
  return candidate === root || candidate.startsWith(base);
}
