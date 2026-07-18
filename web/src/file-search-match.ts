// Rank a single candidate path against the lowercase query on its basename: `0` for a
// filename-prefix match (ranked highest), `1` for any other substring match, `undefined` for no
// match at all.
function rankOf(path: string, lowerQuery: string): 0 | 1 | undefined {
  const basename = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  if (basename.startsWith(lowerQuery)) return 0;
  if (basename.includes(lowerQuery)) return 1;
  return undefined;
}

function isBetter(candidate: string, candidateRank: 0 | 1, best: string, bestRank: 0 | 1): boolean {
  if (candidateRank !== bestRank) return candidateRank < bestRank;
  if (candidate.length !== best.length) return candidate.length < best.length;
  return candidate.localeCompare(best) < 0;
}

// The single best-ranked candidate for `query` among `paths`, computed in one linear scan (no
// sort of the whole list, so per-keystroke cost stays O(n) — Decision 10): a filename-prefix
// match beats any other substring match, ties broken by shorter path then `localeCompare`
// (Decision 4). Returns `undefined` for an empty (post-trim) query or when nothing matches.
export function bestFileMatch(paths: string[], query: string): string | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;
  const lowerQuery = trimmed.toLowerCase();

  let best: string | undefined;
  let bestRank: 0 | 1 | undefined;
  for (const path of paths) {
    const rank = rankOf(path, lowerQuery);
    if (rank === undefined) continue;
    if (best === undefined || bestRank === undefined || isBetter(path, rank, best, bestRank)) {
      best = path;
      bestRank = rank;
    }
  }
  return best;
}

// The inline ghost-completion suffix: the remainder of `path`'s filename after the typed query,
// reported only when the filename actually starts with the query (Decision 1) — a mid-string
// substring match shows no ghost text, just the path line below the input.
export function ghostSuffix(path: string, query: string): string | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;
  const basename = path.slice(path.lastIndexOf('/') + 1);
  if (!basename.toLowerCase().startsWith(trimmed.toLowerCase())) return undefined;
  return basename.slice(trimmed.length);
}
