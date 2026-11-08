import { homedir } from 'node:os';
import { DEFAULT_ROLES, readRolesFile } from '../plugins/roles/roles-file.js';
import type { Role, RoleEntry } from '../plugins/roles/shared.js';
import type { AcpRole } from './role.js';
import type { AcpPromptResult } from './types.js';

// The role whose entries the core ACP session launches, in order of preference.
export const ASK_ROLE = 'ask';

export const NO_ASK_MODEL = 'ACP: the ask role lists no models.';

export function noRoleModels(role: AcpRole): string {
  return `ACP: the ${role} role lists no models.`;
}

export type AskModels = (root: string) => RoleEntry[];

export type AcpRoleSettings = { name: string; entries: RoleEntry[]; commands: string[] };
export type AskRoleSettingsReader = (root: string) => AcpRoleSettings;

function findRole(roles: readonly Role[], name: string): Role | undefined {
  const target = name.trim().toLowerCase();
  return roles.find((role) => role.name.trim().toLowerCase() === target);
}

function copyEntries(entries: readonly RoleEntry[]): RoleEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

export function defaultAskEntries(): RoleEntry[] {
  return copyEntries(findRole(DEFAULT_ROLES, ASK_ROLE)?.entries ?? []);
}

export function readRoleSettings(
  root: string, name: string, home: string = homedir(),
): AcpRoleSettings {
  const configured = findRole(readRolesFile(home, root, { create: false }).roles, name);
  const defaults = findRole(DEFAULT_ROLES, name);
  if (!configured) {
    return {
      name: defaults?.name ?? name,
      entries: copyEntries(defaults?.entries ?? []),
      commands: [...(defaults?.commands ?? [])],
    };
  }
  return {
    name: configured.name,
    entries: copyEntries(configured.entries.length === 0 ? defaults?.entries ?? [] : configured.entries),
    commands: [...configured.commands],
  };
}

export function askRoleSettings(root: string, home: string = homedir()): AcpRoleSettings {
  return readRoleSettings(root, ASK_ROLE, home);
}

// The `ask` role in the roles file in effect — the project's over the home one — read fresh and never
// created. A file with no `ask` role, or one whose entries are empty, uses the built-in default's
// entries: the defaults are written only when the roles tab creates a new file, so most existing files
// predate the role, and an ACP request with zero models could only ever fail.
export function askRoleEntries(root: string, home: string = homedir()): RoleEntry[] {
  return askRoleSettings(root, home).entries;
}

export function sameEntry(left: RoleEntry, right: RoleEntry): boolean {
  return left.harness === right.harness && left.model === right.model && left.effort === right.effort;
}

// The tab's open session is tried first, so a conversation that is working keeps its model; the
// role's other entries follow in their own order.
export function attemptOrder(entries: readonly RoleEntry[], current?: RoleEntry): RoleEntry[] {
  if (!current) return [...entries];
  return [current, ...entries.filter((entry) => !sameEntry(entry, current))];
}

export function describeEntry(entry: RoleEntry): string {
  return `${entry.harness} ${entry.model}`;
}

export function fallbackNotice(failed: RoleEntry, next: RoleEntry): string {
  return `ACP: ${describeEntry(failed)} failed — trying ${describeEntry(next)}.`;
}

export type AttemptFailure = { entry: RoleEntry; error: string };

export function exhaustedError(failures: readonly AttemptFailure[], role: AcpRole = 'ask'): string {
  return [
    `ACP: every model in the ${role} role failed.`,
    ...failures.map(({ entry, error }) => `- ${describeEntry(entry)}: ${error}`),
  ].join('\n');
}

// What an attempt settles its caller with. When every model failed the result is rebuilt as the
// exhausted error, and the rebuild must carry the record id the last attempt's result held: that
// record is where the prompt's final block lives.
export function finalAttemptResult(
  result: AcpPromptResult, failed: boolean, failures: readonly AttemptFailure[], role: AcpRole,
): AcpPromptResult {
  if (!failed || failures.length < 2) return result;
  const exhausted = { answered: false as const, error: exhaustedError(failures, role) };
  return result.recordId ? { ...exhausted, recordId: result.recordId } : exhausted;
}
