// Recent history entries for the picker: unique commands ordered oldest-first so the most recent
// sits at the bottom (nearest the command line). Walks newest→oldest keeping the first (most
// recent) occurrence of each command, capped at `count`, then reverses.
export function getRecentHistory(history: string[], count: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = history.length - 1; i >= 0 && out.length < count; i--) {
    if (!seen.has(history[i])) { seen.add(history[i]); out.push(history[i]); }
  }
  return out.reverse();
}
