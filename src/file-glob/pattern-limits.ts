import { braceExpand } from 'minimatch';

export const FILE_GLOB_MAX_PATTERN_LENGTH = 1024;

export const FILE_GLOB_MAX_NAME_STARS = 3;

export const FILE_GLOB_MAX_ALTERNATIVES = 64;

export const FILE_GLOB_MAX_ALTERNATIVES_AT_MAX_STARS = 2;

export const FILE_GLOB_MANY_ALTERNATIVES_NAME_STARS = 2;

export const FILE_GLOB_TOO_COMPLEX =
  'Pattern too complex: use at most 1024 characters, 64 {a,b} combinations, and three * wildcards in one name, or two when {a,b} choices make more than two patterns.';

export const FILE_GLOB_PARENT_SEGMENT =
  'Pattern cannot contain a .. folder: file glob only lists paths inside --path.';

export function normalizeGlobPattern(pattern: string): string {
  return pattern.replaceAll('\\', '/');
}

function starRuns(name: string): number {
  if (name === '**') return 0;
  return name.match(/\*+/g)?.length ?? 0;
}

function hasParentSegment(alternative: string): boolean {
  return alternative.split('/').includes('..');
}

function hasTooManyStars(alternative: string, maxStars: number): boolean {
  return alternative.split('/').some((name) => starRuns(name) > maxStars);
}

// The matcher runs synchronously on the main event loop, and each `*` in one name adds a stage of
// work to a failed match, so the cost grows with the name length raised to the star count; `?` and
// `**` stay linear. A failing name is tested against every {a,b} alternative in turn, so the costs
// add up. Against a 255-character name, one three-star name measured up to 2.1 ms and 64 of them
// about 135 ms, while 64 two-star alternatives took 0.9 ms; so three stars are allowed only up to
// two alternatives.
// `normalizeGlobPattern` rewrites every `\` to `/` before the matcher expands braces, so `\{a,b}`
// is a real choice there, not an escaped brace. The cap judges that same normalized pattern, or
// such a pattern would pass as one alternative.
// At optimizationLevel 2, minimatch splits each `**/../<p>/<p>` into additional patterns and
// throws a RangeError once that growth passes its own limit. The paths the matcher sees never hold
// a `..` name, so any alternative with one is refused outright before minimatch is constructed.
export function globPatternRefusal(pattern: string): string | undefined {
  if (pattern.length > FILE_GLOB_MAX_PATTERN_LENGTH) return FILE_GLOB_TOO_COMPLEX;
  const alternatives = braceExpand(normalizeGlobPattern(pattern), { braceExpandMax: FILE_GLOB_MAX_ALTERNATIVES + 1 });
  if (alternatives.length > FILE_GLOB_MAX_ALTERNATIVES) return FILE_GLOB_TOO_COMPLEX;
  if (alternatives.some((alternative) => hasParentSegment(alternative))) return FILE_GLOB_PARENT_SEGMENT;
  const maxStars =
    alternatives.length > FILE_GLOB_MAX_ALTERNATIVES_AT_MAX_STARS
      ? FILE_GLOB_MANY_ALTERNATIVES_NAME_STARS
      : FILE_GLOB_MAX_NAME_STARS;
  return alternatives.some((alternative) => hasTooManyStars(alternative, maxStars)) ? FILE_GLOB_TOO_COMPLEX : undefined;
}

export function isGlobPatternTooComplex(pattern: string): boolean {
  return globPatternRefusal(pattern) !== undefined;
}
