import path from 'node:path';

const { matchesGlob } = path;

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

// Whether one project-relative path is selected by a field. A pattern that says nothing about depth —
// no `/` anywhere in it — names something at any depth, so it is matched a second time under `**/`
// and `*.test.ts` reaches the tests in `src/` as well as the one at the project root. A pattern that
// does name depth is a statement about where to look and is matched as written, so `src/*.ts` stays
// about `src/` and the `*` in it still does not cross a boundary.
//
// A pattern that is *not* a glob names a directory as well as a file, and selects everything beneath
// it, so `src` behaves as `src/**`, which is what a user means by it and what makes the field useful
// for narrowing rather than only exact selection. A pattern that *is* a glob is left to `matchesGlob`
// alone, since a glob is a statement about names and not about subtrees.
function selects(relPath: string, pattern: string): boolean {
  const normalized = normalize(pattern);
  if (matchesGlob(relPath, normalized)) return true;
  if (!normalized.includes('/') && matchesGlob(relPath, `**/${normalized}`)) return true;
  if (GLOB_CHARS.test(normalized)) return false;
  const prefix = `${normalized}/`;
  return relPath === normalized || relPath.startsWith(prefix);
}

function anySelects(relPath: string, field: string): boolean {
  return patterns(field).some((pattern) => selects(relPath, pattern));
}

// Narrow a project file list to the paths an include and exclude field select. An empty include
// selects everything, an empty exclude removes nothing, and a path an include names but an exclude
// also names is removed — exclude wins, as it does in every tool with these two fields.
//
// Paths arriving here are the project-relative forward-slash form `listProjectFiles` returns, which
// is the form `matchesGlob` expects, so no path rewriting is needed beyond normalizing the pattern.
export function filterPaths(paths: readonly string[], include: string, exclude: string): string[] {
  const hasInclude = patterns(include).length > 0;
  if (!hasInclude && patterns(exclude).length === 0) return [...paths];
  return paths.filter((relPath) => {
    if (hasInclude && !anySelects(relPath, include)) return false;
    return !anySelects(relPath, exclude);
  });
}
