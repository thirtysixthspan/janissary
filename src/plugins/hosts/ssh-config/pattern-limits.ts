export const HOST_PATTERN_MAX_LENGTH = 1024;

export const HOST_PATTERN_MAX_STARS = 3;

// Matching runs synchronously on the main event loop, and each `*` in one name adds a stage of work
// to a failed match, so the cost grows with the name length raised to the star count; `?` and `**`
// stay linear. Refuse a name crossing either cap before Minimatch compiles it.
export function isHostPatternTooComplex(pattern: string): boolean {
  if (pattern.length > HOST_PATTERN_MAX_LENGTH) return true;
  return (pattern.match(/\*+/g)?.length ?? 0) > HOST_PATTERN_MAX_STARS;
}
