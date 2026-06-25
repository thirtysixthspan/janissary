// Recent history entries for the picker: unique commands ordered oldest-first so the most recent
// sits at the bottom (nearest the command line). Walks newest→oldest keeping the first (most
// recent) occurrence of each command, capped at `count`, then reverses.
export function getRecentHistory(history: string[], count: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let index = history.length - 1; index >= 0 && out.length < count; index--) {
    if (seen.has(history[index])) {
    	continue;
    }

    seen.add(history[index]); out.push(history[index]);
  }
  return out.toReversed();
}
