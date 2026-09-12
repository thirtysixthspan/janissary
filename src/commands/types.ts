import type { Managers } from '../managers.js';

export type CommandManagers = Managers;

export interface Command {
  name: string;
  match: (command: string) => boolean;
  // Canonical inputs this command owns, spelled as they reach the registry loop in `../resolve.ts`
  // (trimmed, with any leading `/` already stripped). `../commands.test.ts` walks the registry in
  // dispatch order and fails when an earlier entry claims one of these, so a command appended to
  // the list cannot silently shadow — or be shadowed by — another.
  samples: readonly string[];
  run: (
    command: string,
    tab: { label: string; index: number },
    managers: CommandManagers,
  ) => void | Promise<void>;
}
