import path from 'node:path';

const { matchesGlob } = path;

// Comma-separated glob patterns, the syntax VS Code documents for its include and exclude fields: a
// bare pattern matches at any depth, patterns are trimmed, and an empty field means no constraint.
// A pattern that does not compile is treated as matching nothing rather than raising, which is how a
// mistyped include field behaves in VS Code — it narrows to nothing instead of failing the search.
function patterns(field: string): string[] {
  return field.split(',').map((entry) => entry.trim()).filter(Boolean);
}

const GLOB_CHARS = /[*?[\]{}]/u;

// Whether one project-relative path is selected by a field. A pattern that names a directory — one
// with no glob metacharacter in it — also selects everything beneath it, so `src` behaves as
// `src/**`, which is what a user means by it and what makes the field useful for narrowing rather
// than only exact selection. A pattern that *is* a glob is left to `matchesGlob` alone, since
// `*` does not cross a `/` and `*.test.ts` must not silently become a prefix rule.
function selects(relPath: string, pattern: string): boolean {
  if (matchesGlob(relPath, pattern)) return true;
  if (GLOB_CHARS.test(pattern)) return false;
  const anchored = pattern.startsWith('./') ? pattern.slice(2) : pattern;
  const prefix = `${anchored.replace(/\/+$/u, '')}/`;
  return relPath === anchored || relPath.startsWith(prefix);
}

function anySelects(relPath: string, field: string): boolean {
  return patterns(field).some((pattern) => selects(relPath, pattern));
}

// Narrow a project file list to the paths an include and exclude field select. An empty include
// selects everything, an empty exclude removes nothing, and a path an include names but an exclude
// also names is removed — exclude wins, as it does in every tool with these two fields.
//
// Paths arriving here are the project-relative forward-slash form `listProjectFiles` returns, which
// is the form `matchesGlob` expects, so no path rewriting is needed.
export function filterPaths(paths: readonly string[], include: string, exclude: string): string[] {
  const hasInclude = patterns(include).length > 0;
  if (!hasInclude && patterns(exclude).length === 0) return [...paths];
  return paths.filter((relPath) => {
    if (hasInclude && !anySelects(relPath, include)) return false;
    return !anySelects(relPath, exclude);
  });
}
