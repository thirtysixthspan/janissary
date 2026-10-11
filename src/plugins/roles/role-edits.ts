import { TabPluginRejection } from '../api.js';
import type { Role, RoleEntry } from './shared.js';

// The nine role-list edits, as pure functions over the decoded role list. Each answers the new list
// or refuses a request the caller could have gotten wrong — a name already taken, a role that is
// not there, an index past the end, a description written against text the file no longer holds — by
// throwing the contract's own rejection, so the activation never spells the same check twice.

const clash = (roles: readonly Role[], name: string, except?: string): boolean =>
  roles.some((role) => role.name.toLowerCase() === name.toLowerCase() && role.name !== except);

const find = (roles: readonly Role[], name: string): Role => {
  const role = roles.find((entry) => entry.name === name);
  if (!role) throw new TabPluginRejection(`No role named "${name}".`);
  return role;
};

const replace = (roles: readonly Role[], name: string, next: Role): Role[] =>
  roles.map((role) => role.name === name ? next : role);

const at = (role: Role, index: number): RoleEntry => {
  const entry = role.entries[index];
  if (!entry) {
    throw new TabPluginRejection(`No entry at index ${index} in role "${role.name}".`);
  }
  return entry;
};

export function addRole(roles: readonly Role[], name: string): Role[] {
  const trimmed = name.trim();
  if (clash(roles, trimmed)) {
    throw new TabPluginRejection(`A role named "${trimmed}" already exists.`);
  }
  return [...roles, { name: trimmed, description: '', entries: [] }];
}

export function renameRole(roles: readonly Role[], name: string, next: string): Role[] {
  const target = find(roles, name);
  const trimmed = next.trim();
  if (clash(roles, trimmed, name)) {
    throw new TabPluginRejection(`A role named "${trimmed}" already exists.`);
  }
  return replace(roles, name, { ...target, name: trimmed });
}

export function describeRole(
  roles: readonly Role[], name: string, description: string, expected: string,
): Role[] {
  const role = find(roles, name);
  // The description carries the text it was written against. Another client's edit can land between
  // the payload this caller last saw and this read, and overwriting it would be exactly the loss the
  // caller cannot see, so a stale edit is refused rather than applied.
  if (role.description !== expected) {
    throw new TabPluginRejection(`The description of role "${name}" changed elsewhere — nothing was written.`);
  }
  return replace(roles, name, { ...role, description });
}

export function deleteRole(roles: readonly Role[], name: string): Role[] {
  find(roles, name);
  return roles.filter((role) => role.name !== name);
}

export function moveRole(roles: readonly Role[], name: string, to: number): Role[] {
  const role = find(roles, name);
  if (to >= roles.length) throw new TabPluginRejection(`Position ${to} is out of range.`);
  const moved = roles.filter((entry) => entry.name !== name);
  moved.splice(to, 0, role);
  return moved;
}

export function addEntry(roles: readonly Role[], role: string, entry: RoleEntry): Role[] {
  const target = find(roles, role);
  return replace(roles, role, { ...target, entries: [...target.entries, entry] });
}

export function setEntryEffort(
  roles: readonly Role[], role: string, index: number, effort: string | null,
): Role[] {
  const target = find(roles, role);
  const current = at(target, index);
  const next: RoleEntry = effort === null
    ? { harness: current.harness, model: current.model }
    : { ...current, effort };
  const entries = target.entries.map((entry, position) => position === index ? next : entry);
  return replace(roles, role, { ...target, entries });
}

export function removeEntry(roles: readonly Role[], role: string, index: number): Role[] {
  const target = find(roles, role);
  at(target, index);
  const entries = target.entries.filter((_entry, position) => position !== index);
  return replace(roles, role, { ...target, entries });
}

export function moveEntry(roles: readonly Role[], role: string, from: number, to: number): Role[] {
  const target = find(roles, role);
  const moved = at(target, from);
  if (to >= target.entries.length) throw new TabPluginRejection(`Position ${to} is out of range.`);
  const entries = target.entries.filter((_entry, position) => position !== from);
  entries.splice(to, 0, moved);
  return replace(roles, role, { ...target, entries });
}
