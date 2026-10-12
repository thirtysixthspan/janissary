import type { Managers } from '../managers.js';

export type CommandManagers = Managers;

export type CommandInvocationContext = Readonly<{
  runId: string;
  invocationId: string;
  caller: Readonly<{
    label: string;
    incarnation?: string;
    cwd: string;
    context: readonly string[];
  }>;
  signal: AbortSignal;
}>;

export interface Command {
  name: string;
  match: (command: string) => boolean;
  available?: (label: string, managers: Managers) => boolean;
  coreResponse?: boolean;
  structuredResult?: true;
  // Canonical inputs this command owns, spelled as they reach the registry loop in `../resolve.ts`
  // (trimmed, with any leading `/` already stripped). `../commands.test.ts` walks the registry in
  // dispatch order and fails when an earlier entry claims one of these, so a command appended to
  // the list cannot silently shadow — or be shadowed by — another.
  samples: readonly string[];
  run: (
    command: string,
    tab: { label: string; index: number },
    managers: CommandManagers,
    invocation?: CommandInvocationContext,
  ) => unknown | void | Promise<unknown | void>;
}
