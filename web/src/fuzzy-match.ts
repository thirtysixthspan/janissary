export type FuzzyMatchResult = { path: string; score: number; ranges: [number, number][] };

const CONSECUTIVE_BONUS = 5;
const BOUNDARY_BONUS = 3;
const BASENAME_BONUS = 2;
const BASE_CHAR_SCORE = 1;
const BOUNDARY_CHARS = new Set(['/', '-', '_', '.', ' ']);

// Cheap presence-only pre-filter (Decision 11a): a single left-to-right subsequence walk with no
// scoring, bailing the moment a query char can't be found — avoids scoring the large majority of
// non-matches on every keystroke. No regex, so `security/detect-unsafe-regex` never applies here.
export function hasSubsequence(lowerPath: string, lowerQuery: string): boolean {
  let qi = 0;
  for (let pi = 0; pi < lowerPath.length && qi < lowerQuery.length; pi++) {
    if (lowerPath[pi] === lowerQuery[qi]) qi++;
  }
  return qi === lowerQuery.length;
}

// True when `path[i]` starts a new "word": the very first character, right after a path/word
// separator, or a capital following a lowercase letter (camelCase boundary).
function isBoundary(path: string, i: number): boolean {
  if (i === 0) return true;
  const prev = path[i - 1];
  if (BOUNDARY_CHARS.has(prev)) return true;
  const c = path[i];
  return c >= 'A' && c <= 'Z' && !(prev >= 'A' && prev <= 'Z');
}

// The bonus-weighted score for matching `path[pi]`: a base point, plus a filename-portion bonus,
// a segment/camelCase-boundary bonus, and a consecutive-run bonus when the previous matched
// character was the immediate predecessor (Decision 1).
function charScoreAt(path: string, pi: number, basenameStart: number, lastMatched: number): number {
  let charScore = BASE_CHAR_SCORE;
  if (pi >= basenameStart) charScore += BASENAME_BONUS;
  if (isBoundary(path, pi)) charScore += BOUNDARY_BONUS;
  if (pi === lastMatched + 1) charScore += CONSECUTIVE_BONUS;
  return charScore;
}

// Merge `pi` into `ranges`' last range if it's contiguous with it, otherwise start a new one.
function extendRanges(ranges: [number, number][], pi: number): void {
  const last = ranges.at(-1);
  if (last && last[1] === pi) last[1] = pi + 1;
  else ranges.push([pi, pi + 1]);
}

// A single greedy leftmost subsequence alignment of `lowerQuery` against `lowerPath`, scored via
// `charScoreAt`. Returns `null` if — despite passing the presence pre-filter — no alignment is
// found (never happens when `hasSubsequence` already returned true for the same inputs, but keeps
// the function total). Ranges are only merged/built when `collectRanges` is set, so scoring every
// survivor of the pre-filter stays allocation-free; ranges are computed a second time, later, only
// for the capped top-N (Decision 11c).
function matchPath(
  path: string, lowerPath: string, lowerQuery: string, basenameStart: number, collectRanges: boolean,
): { score: number; ranges: [number, number][] } | null {
  const ranges: [number, number][] = [];
  let score = 0;
  let qi = 0;
  let lastMatched = -2;
  for (let pi = 0; pi < lowerPath.length && qi < lowerQuery.length; pi++) {
    if (lowerPath[pi] !== lowerQuery[qi]) continue;
    score += charScoreAt(path, pi, basenameStart, lastMatched);
    if (collectRanges) extendRanges(ranges, pi);
    lastMatched = pi;
    qi++;
  }
  return qi === lowerQuery.length ? { score, ranges } : null;
}

// Fuzzy subsequence match every candidate path against `query`, returning at most `limit` results
// ranked best-first: a filename match outranks a directory-only one, consecutive/boundary matches
// outrank scattered ones, and a shorter path breaks an exact score tie. An empty (post-trim) query
// short-circuits to no results (Decision 4/11) — there is nothing to rank against.
export function fuzzyMatch(paths: string[], query: string, limit: number): FuzzyMatchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const lowerQuery = trimmed.toLowerCase();

  const scored: { path: string; score: number }[] = [];
  for (const path of paths) {
    const lowerPath = path.toLowerCase();
    if (!hasSubsequence(lowerPath, lowerQuery)) continue;
    const basenameStart = path.lastIndexOf('/') + 1;
    const matched = matchPath(path, lowerPath, lowerQuery, basenameStart, false);
    if (matched) scored.push({ path, score: matched.score });
  }

  scored.sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path));
  const top = scored.slice(0, limit);

  return top.map(({ path, score }) => {
    const lowerPath = path.toLowerCase();
    const basenameStart = path.lastIndexOf('/') + 1;
    const ranges = matchPath(path, lowerPath, lowerQuery, basenameStart, true)?.ranges ?? [];
    return { path, score, ranges };
  });
}
