import { listApplicationCommands } from '../application-commands.js';
import { disabledApplicationCommand } from '../native-commands/policy.js';
import type { CommandSettingsSnapshot } from '../native-commands/settings-types.js';

export type CompletionPolicy = Readonly<{
  allows: (input: string) => boolean;
  names: readonly string[];
}>;

type CandidateRow = Readonly<{
  forms: readonly string[];
  aliases: readonly string[];
  effectiveEnabled?: boolean;
}>;

function firstWord(value: string): string | undefined {
  return value.trim().split(/\s+/u, 1)[0];
}

export function commandNameCandidates(snapshot?: CommandSettingsSnapshot): string[] {
  const rows: readonly CandidateRow[] = snapshot?.commands ?? listApplicationCommands();
  const names = rows
    .flatMap((row) => row.effectiveEnabled === false ? [] : [...row.forms, ...row.aliases])
    .filter((form) => form !== '!')
    .map((form) => firstWord(form))
    .filter((word): word is string => word !== undefined && word.length > 0);
  return [...new Set(names)].toSorted((left, right) => left.localeCompare(right));
}

export function completionPolicy(snapshot?: CommandSettingsSnapshot): CompletionPolicy {
  return {
    allows: (input) => disabledApplicationCommand(input, snapshot) === undefined,
    names: commandNameCandidates(snapshot),
  };
}

export const ALL_ENABLED_POLICY: CompletionPolicy = completionPolicy();
