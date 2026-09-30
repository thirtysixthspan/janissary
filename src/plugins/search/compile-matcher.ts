export type MatcherModes = { regex: boolean; matchCase: boolean; wholeWord: boolean };

// Where the first match on a line sits, as UTF-16 offsets into it: `start` inclusive, `end` exclusive.
export type MatchSpan = { start: number; end: number };

// `test` answers whether a line matches and `locate` where. Both run the same compiled pattern, so a
// line `test` accepts is always one `locate` finds.
export type Matcher = { test(line: string): boolean; locate(line: string): MatchSpan | null };

// A match must sit on a word boundary: not preceded and not followed by a word character, where a
// word character is a letter, a digit, or an underscore. Applied as a lookaround around the pattern
// rather than by inspecting the match index, so it composes with a user-supplied regex unchanged —
// which is the behaviour VS Code and Zed both have.
function bounded(source: string, flags: string): RegExp | null {
  try {
    return new RegExp(String.raw`(?<!\w)(?:${source})(?!\w)`, flags);
  } catch {
    return null;
  }
}

// Compile a query into a line matcher, or null when there is nothing to search for or the pattern
// will not compile. A plain-text query is matched literally, so a query containing regex
// metacharacters searches for those characters rather than failing to compile.
//
// A zero-length pattern — an empty regex query, or one that can match nothing — is refused rather
// than returned, because it would mark every line of every file as a match.
export function compileMatcher(query: string, modes: MatcherModes): Matcher | null {
  if (!query) return null;
  const flags = modes.matchCase ? '' : 'i';
  const source = modes.regex ? query : query.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const pattern = modes.wholeWord ? bounded(source, flags) : safe(source, flags);
  if (!pattern) return null;
  if (pattern.test('')) return null;
  return {
    test: (line) => pattern.test(line),
    locate: (line) => {
      const found = pattern.exec(line);
      return found ? { start: found.index, end: found.index + found[0].length } : null;
    },
  };
}

function safe(source: string, flags: string): RegExp | null {
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}
