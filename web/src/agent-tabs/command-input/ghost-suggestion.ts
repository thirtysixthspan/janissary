// The ghost-text suggestion for the command line: the most recent history entry that starts
// with the typed text and extends it. History is ordered oldest → newest, so walk backwards.
// Returns undefined when the input is empty or nothing strictly longer matches.
export function findGhostSuggestion(history: string[], typed: string): string | undefined {
  if (typed === '') return undefined;
  for (let index = history.length - 1; index >= 0; index--) {
    const entry = history[index];
    if (entry.length > typed.length && entry.startsWith(typed)) return entry;
  }
  return undefined;
}
