import { homedir } from 'node:os';
import { DEFAULT_ROLES, readRolesFile } from '../plugins/roles/roles-file.js';
import type { Role, RoleEntry } from '../plugins/roles/shared.js';

// The role whose entries the core ACP session launches, in order of preference.
export const ASK_ROLE = 'ask';

export const NO_ASK_MODEL = 'ACP: the ask role lists no models.';

export type AskModels = (root: string) => RoleEntry[];

function askRole(roles: readonly Role[]): Role | undefined {
  return roles.find((role) => role.name.trim().toLowerCase() === ASK_ROLE);
}

export function defaultAskEntries(): RoleEntry[] {
  return (askRole(DEFAULT_ROLES)?.entries ?? []).map((entry) => ({ ...entry }));
}

// The `ask` role in the roles file in effect — the project's over the home one — read fresh and never
// created. A file with no `ask` role, or one whose entries are empty, uses the built-in default's
// entries: the defaults are written only when the roles tab creates a new file, so most existing files
// predate the role, and an ACP request with zero models could only ever fail.
export function askRoleEntries(root: string, home: string = homedir()): RoleEntry[] {
  const configured = askRole(readRolesFile(home, root, { create: false }).roles);
  return configured && configured.entries.length > 0
    ? configured.entries.map((entry) => ({ ...entry }))
    : defaultAskEntries();
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

export function exhaustedError(failures: readonly AttemptFailure[]): string {
  return [
    'ACP: every model in the ask role failed.',
    ...failures.map(({ entry, error }) => `- ${describeEntry(entry)}: ${error}`),
  ].join('\n');
}
