import { createGlobMatcher, type GlobMatcher } from '../file-glob/match.js';

// Comma-separated glob patterns, the syntax VS Code documents for its include and exclude fields:
// patterns are trimmed, and an empty field means no constraint. A pattern that does not compile is
// treated as matching nothing rather than raising, which is how a mistyped include field behaves in
// VS Code — it narrows to nothing instead of failing the search.
function patterns(field: string): string[] {
  return field.split(',').map((entry) => entry.trim()).filter(Boolean);
}

const GLOB_CHARS = /[*?[\]{}]/u;

// A pattern in the form the paths it is matched against are written. Every path arriving here comes
// from `listProjectFiles`, which is root-relative and forward-slashed, so a leading `./` — a user
// saying the pattern is anchored to the project root — and a trailing `/` — a user naming a
// directory the way they write one on a shell — are both removed, and a `\` is folded to `/` so a
// path pasted from a Windows shell matches too. Anchoring is a property of the whole rule rather
// than of one branch, so `./src/**` means what `./src` already means.
function normalize(pattern: string): string {
  return pattern
    .replaceAll('\\', '/')
    .replace(/^\.\/+/u, '')
    .replace(/\/+$/u, '');
}

// The selector for one include/exclude pattern. Matching goes through the same case-sensitive
// matcher file glob uses, so the two pipelines select the same paths on every host. Only the
// behavior unique to these fields lives here: a pattern with no `/` names something at any depth,
// so it is tried again under `**/`; and a pattern that is not a glob names a directory as well as a
// file, so it selects everything beneath it. A pattern that *is* a glob is left to the matcher alone,
// since a glob is a statement about names and not about subtrees.
function selector(pattern: string): GlobMatcher {
  const normalized = normalize(pattern);
  const match = createGlobMatcher(normalized, false);
  const deepMatch = normalized.includes('/') ? undefined : createGlobMatcher(`**/${normalized}`, false);
  const isGlob = GLOB_CHARS.test(normalized);
  const prefix = `${normalized}/`;
  return (relPath) => {
    if (match(relPath)) return true;
    if (deepMatch?.(relPath)) return true;
    if (isGlob) return false;
    return relPath === normalized || relPath.startsWith(prefix);
  };
}

// Narrow a project file list to the paths an include and exclude field select. An empty include
// selects everything, an empty exclude removes nothing, and a path an include names but an exclude
// also names is removed — exclude wins, as it does in every tool with these two fields.
//
// Matchers are compiled once per field rather than once per path. Paths arriving here are the
// project-relative forward-slash form `listProjectFiles` returns, which is the form the matcher
// expects, so no path rewriting is needed beyond normalizing the pattern.
export function filterPaths(paths: readonly string[], include: string, exclude: string): string[] {
  const includeSelectors = patterns(include).map((pattern) => selector(pattern));
  const excludeSelectors = patterns(exclude).map((pattern) => selector(pattern));
  if (includeSelectors.length === 0 && excludeSelectors.length === 0) return [...paths];
  return paths.filter((relPath) => {
    if (includeSelectors.length > 0 && includeSelectors.every((test) => !test(relPath))) return false;
    return excludeSelectors.every((test) => !test(relPath));
  });
}
