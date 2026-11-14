import { braceExpand } from 'minimatch';

export const FILE_GLOB_MAX_PATTERN_LENGTH = 1024;

export const FILE_GLOB_MAX_NAME_STARS = 3;

export const FILE_GLOB_MAX_ALTERNATIVES = 64;

export const FILE_GLOB_MAX_ALTERNATIVES_AT_MAX_STARS = 2;

export const FILE_GLOB_MANY_ALTERNATIVES_NAME_STARS = 2;

export const FILE_GLOB_TOO_COMPLEX =
  'Pattern too complex: use at most 1024 characters, 64 {a,b} combinations, and three * wildcards in one name, or two when {a,b} choices make more than two patterns.';

export function normalizeGlobPattern(pattern: string): string {
  return pattern.replaceAll('\\', '/');
}

function starRuns(name: string): number {
  if (name === '**') return 0;
  return name.match(/\*+/g)?.length ?? 0;
}

function hasTooManyStars(alternative: string, maxStars: number): boolean {
  return alternative.split('/').some((name) => starRuns(name) > maxStars);
}

// Each `*` in one name nests another backtracking loop in the compiled matcher, so the cost of a
// failed match grows with the name length raised to the star count; `?` and `**` stay linear.
// A failing name is tested against every {a,b} alternative in turn, so the costs add up. Against a
// 255-character name, one three-star name measured up to 2.1 ms and 64 of them about 135 ms, while
// 64 two-star alternatives took 0.9 ms; so three stars are allowed only up to two alternatives.
// The matcher runs minimatch with `windowsPathsNoEscape`, which rewrites every `\` to `/` before it
// expands braces, so `\{a,b}` is a real choice there, not an escaped brace. The cap judges the same
// normalized pattern the matcher compiles, or such a pattern would pass as one alternative.
export function isGlobPatternTooComplex(pattern: string): boolean {
  if (pattern.length > FILE_GLOB_MAX_PATTERN_LENGTH) return true;
  const alternatives = braceExpand(normalizeGlobPattern(pattern), { braceExpandMax: FILE_GLOB_MAX_ALTERNATIVES + 1 });
  if (alternatives.length > FILE_GLOB_MAX_ALTERNATIVES) return true;
  const maxStars =
    alternatives.length > FILE_GLOB_MAX_ALTERNATIVES_AT_MAX_STARS
      ? FILE_GLOB_MANY_ALTERNATIVES_NAME_STARS
      : FILE_GLOB_MAX_NAME_STARS;
  return alternatives.some((alternative) => hasTooManyStars(alternative, maxStars));
}
