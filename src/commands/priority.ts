import type { Command } from './types.js';

// One declared sample that the registry would not route to the command declaring it. `matchedBy` is
// the command that claims it instead, or `null` when nothing in the list matches it at all — a
// sample that no longer describes its own command is as broken a declaration as a shadowed one.
export type PriorityConflict = {
  input: string;
  owner: string;
  matchedBy: string | null;
};

// Models `resolveCommand`'s first-fit walk: the first entry whose `match` accepts the input wins.
// `help` and `shell` are deliberately absent — neither is a registry entry, so the loop never sees
// them.
export function findPriorityConflicts(commands: readonly Command[]): PriorityConflict[] {
  const conflicts: PriorityConflict[] = [];
  for (const owner of commands) {
    for (const input of owner.samples) {
      const winner = commands.find((candidate) => candidate.match(input));
      if (winner === owner) continue;
      conflicts.push({ input, owner: owner.name, matchedBy: winner?.name ?? null });
    }
  }
  return conflicts;
}
