import { isRecord } from '../api.js';

export const ROLES_PAYLOAD_SCHEMA_VERSION = 1;

// One harness/model/effort choice inside a role. `effort` is absent for the default (no effort
// stored); any other value is passed through verbatim, the way `harness --effort` is.
export type RoleEntry = { harness: string; model: string; effort?: string };

// A role as the tab shows it: the name is the file's key, the description is the guidance a human
// or an AI task reads, and the entries are the ordered choices the role maps to.
export type Role = { name: string; description: string; entries: RoleEntry[] };

// Which roles file the tab is editing: the project's own, the user's home one, or neither — the
// default set, shown only when a file exists but nothing in it decodes.
export type RolesSource = 'home' | 'project' | 'default';

// The launch vocabulary the host publishes: every harness's known models and the effort levels a
// surface may offer.
export type LaunchCatalog = { models: Record<string, string[]>; efforts: string[] };

export type RolesPayload = {
  roles: Role[];
  source: RolesSource;
  path: string;
  problem?: string;
  catalog: LaunchCatalog;
};

export type AddRoleIntent = { name: string };
export type RenameRoleIntent = { name: string; next: string };
export type DescribeRoleIntent = { name: string; description: string };
export type DeleteRoleIntent = { name: string };
export type MoveRoleIntent = { name: string; to: number };
export type AddEntryIntent = { role: string; entry: RoleEntry };
export type SetEntryEffortIntent = { role: string; index: number; effort: string | null };
export type RemoveEntryIntent = { role: string; index: number };
export type MoveEntryIntent = { role: string; from: number; to: number };

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRolesSource(value: unknown): value is RolesSource {
  return typeof value === 'string'
    && (['home', 'project', 'default'] as readonly string[]).includes(value);
}

function isEntry(value: unknown): value is RoleEntry {
  return isRecord(value)
    && typeof value.harness === 'string' && value.harness.length > 0
    && typeof value.model === 'string' && value.model.length > 0
    && (value.effort === undefined || typeof value.effort === 'string');
}

export function isAddRoleIntent(value: unknown): value is AddRoleIntent {
  return isRecord(value) && isName(value.name);
}

export function isRenameRoleIntent(value: unknown): value is RenameRoleIntent {
  return isRecord(value) && isName(value.name) && isName(value.next);
}

export function isDescribeRoleIntent(value: unknown): value is DescribeRoleIntent {
  return isRecord(value) && isName(value.name) && typeof value.description === 'string';
}

export function isDeleteRoleIntent(value: unknown): value is DeleteRoleIntent {
  return isRecord(value) && isName(value.name);
}

export function isMoveRoleIntent(value: unknown): value is MoveRoleIntent {
  return isRecord(value) && isName(value.name) && isIndex(value.to);
}

export function isAddEntryIntent(value: unknown): value is AddEntryIntent {
  return isRecord(value) && isName(value.role) && isEntry(value.entry);
}

export function isSetEntryEffortIntent(value: unknown): value is SetEntryEffortIntent {
  return isRecord(value)
    && isName(value.role)
    && isIndex(value.index)
    && (typeof value.effort === 'string' || value.effort === null);
}

export function isRemoveEntryIntent(value: unknown): value is RemoveEntryIntent {
  return isRecord(value) && isName(value.role) && isIndex(value.index);
}

export function isMoveEntryIntent(value: unknown): value is MoveEntryIntent {
  return isRecord(value) && isName(value.role) && isIndex(value.from) && isIndex(value.to);
}

export function isRolesPayload(value: unknown): value is RolesPayload {
  if (!isRecord(value)) return false;
  const { roles, source, path: filePath, catalog, problem } = value;
  return Array.isArray(roles)
    && roles.every((role) => isRecord(role)
      && isName(role.name)
      && typeof role.description === 'string'
      && Array.isArray(role.entries)
      && role.entries.every(isEntry))
    && isRolesSource(source)
    && typeof filePath === 'string'
    && (problem === undefined || typeof problem === 'string')
    && isRecord(catalog)
    && typeof catalog.models === 'object'
    && catalog.models !== null
    && Array.isArray(catalog.efforts)
    && catalog.efforts.every((effort) => typeof effort === 'string');
}
