import { braceExpand } from 'minimatch';

export const FILE_GLOB_MAX_PATTERN_LENGTH = 1024;

export const FILE_GLOB_MAX_NAME_STARS = 3;

export const FILE_GLOB_MAX_ALTERNATIVES = 64;

export const FILE_GLOB_TOO_COMPLEX =
  'Pattern too complex: use at most 1024 characters, three * wildcards in one name, and 64 {a,b} combinations.';

function starRuns(name: string): number {
  if (name === '**') return 0;
  return name.match(/\*+/g)?.length ?? 0;
}

function hasTooManyStars(alternative: string): boolean {
  return alternative.split(/[/\\]/).some((name) => starRuns(name) > FILE_GLOB_MAX_NAME_STARS);
}

// Each `*` in one name nests another backtracking loop in the compiled matcher, so the cost of a
// failed match grows with the name length raised to the star count; `?` and `**` stay linear.
export function isGlobPatternTooComplex(pattern: string): boolean {
  if (pattern.length > FILE_GLOB_MAX_PATTERN_LENGTH) return true;
  const alternatives = braceExpand(pattern, { braceExpandMax: FILE_GLOB_MAX_ALTERNATIVES + 1 });
  if (alternatives.length > FILE_GLOB_MAX_ALTERNATIVES) return true;
  return alternatives.some((alternative) => hasTooManyStars(alternative));
}
