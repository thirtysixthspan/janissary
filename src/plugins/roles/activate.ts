import { homedir } from 'node:os';
import {
  defineIntents,
  noFileOpener,
  type TabPluginActivation,
  type TabPluginServerCapabilities,
} from '../api.js';
import {
  isAddEntryIntent,
  isAddRoleIntent,
  isDeleteRoleIntent,
  isDescribeRoleIntent,
  isMoveEntryIntent,
  isMoveRoleIntent,
  isRemoveEntryIntent,
  isRenameRoleIntent,
  isRolesPayload,
  isSetEntryEffortIntent,
  type AddEntryIntent,
  type LaunchCatalog,
  type Role,
  type RolesPayload,
} from './shared.js';
import { readRolesFile, writeRolesFile, type RolesRead } from './roles-file.js';
import {
  addEntry, addRole, deleteRole, describeRole, moveEntry, moveRole, removeEntry, renameRole,
  setEntryEffort,
} from './role-edits.js';

const INSTANCE_KEY = 'roles';
const TAB_TITLE = 'roles';

// `home` is a test seam, exactly as the search plugin's scan reader is: production passes nothing
// and the user's home directory is read, while a test points the activation at a temporary one.
export function activate(home: string = homedir()): TabPluginActivation {
  // Every editing intent joins this chain before its read-modify-write, so two rapid edits cannot
  // interleave and lose one: the second reads only once the first has settled, whichever way it
  // went.
  let queue: Promise<unknown> = Promise.resolve();

  const settle = async (previous: Promise<unknown>): Promise<void> => {
    try {
      await previous;
    } catch {
      // The edit that failed already answered its own caller; the chain continues.
    }
  };

  const rootOf = (capabilities: TabPluginServerCapabilities): string =>
    capabilities.originTab()?.root ?? process.cwd();

  const payloadFrom = (read: RolesRead, catalog: LaunchCatalog): RolesPayload => ({
    roles: read.roles,
    source: read.source,
    path: read.path,
    ...(read.problem !== undefined && { problem: read.problem }),
    catalog,
  });

  const publish = (capabilities: TabPluginServerCapabilities): void => {
    const read = readRolesFile(home, rootOf(capabilities));
    capabilities.updateTab(INSTANCE_KEY, () => ({
      payload: payloadFrom(read, capabilities.harnessLaunchCatalog()),
    }));
  };

  // The one shape every editing intent takes: read the file in effect, refuse the edit when the
  // file itself is unusable (an edit would rewrite the damage), apply it, write, and republish
  // from what the file now holds. A failed write is a rejection and leaves the payload unchanged.
  const edit = async (
    capabilities: TabPluginServerCapabilities,
    apply: (roles: Role[]) => Role[],
  ): Promise<null> => {
    const run = async (): Promise<null> => {
      const read = readRolesFile(home, rootOf(capabilities));
      // A read that carries a problem line is one the file does not fully back — either nothing
      // decoded, or some roles/entries were dropped — and writing from it would rewrite the whole
      // file from the decoded part, silently discarding what was dropped. Refuse the edit instead so
      // the damaged file is left exactly as it is until it is fixed by hand.
      if (read.source === 'default' || read.problem !== undefined) {
        return capabilities.rejectRequest(`roles.json at ${read.path} is unusable — fix the file before editing roles.`);
      }
      if (!writeRolesFile(read.path, apply(read.roles))) {
        return capabilities.rejectRequest(`Could not write roles.json at ${read.path}.`);
      }
      publish(capabilities);
      return null;
    };
    const next = (async () => {
      await settle(queue);
      return run();
    })();
    queue = next;
    return next;
  };

  return {
    isPayload: isRolesPayload,
    opener: noFileOpener('roles'),
    command(argument, capabilities) {
      if (argument.trim().length > 0) return capabilities.rejectRequest('Usage: roles');
      capabilities.openOrFocusTab(INSTANCE_KEY, () => ({
        title: TAB_TITLE,
        payload: payloadFrom(readRolesFile(home, rootOf(capabilities)), capabilities.harnessLaunchCatalog()),
      }));
    },
    intent: defineIntents('roles', isRolesPayload, {
      'add-role': {
        payload: isAddRoleIntent,
        run: (_tab, value: { name: string }, capabilities) =>
          edit(capabilities, (roles) => addRole(roles, value.name)),
      },
      'rename-role': {
        payload: isRenameRoleIntent,
        run: (_tab, value: { name: string; next: string }, capabilities) =>
          edit(capabilities, (roles) => renameRole(roles, value.name, value.next)),
      },
      'describe-role': {
        payload: isDescribeRoleIntent,
        run: (_tab, value: { name: string; description: string; expected: string }, capabilities) =>
          edit(capabilities, (roles) => describeRole(roles, value.name, value.description, value.expected)),
      },
      'delete-role': {
        payload: isDeleteRoleIntent,
        run: (_tab, value: { name: string }, capabilities) =>
          edit(capabilities, (roles) => deleteRole(roles, value.name)),
      },
      'move-role': {
        payload: isMoveRoleIntent,
        run: (_tab, value: { name: string; to: number }, capabilities) =>
          edit(capabilities, (roles) => moveRole(roles, value.name, value.to)),
      },
      'add-entry': {
        payload: isAddEntryIntent,
        run: (_tab, value: AddEntryIntent, capabilities) =>
          edit(capabilities, (roles) => addEntry(roles, value.role, value.entry)),
      },
      'set-entry-effort': {
        payload: isSetEntryEffortIntent,
        run: (_tab, value: { role: string; index: number; effort: string | null }, capabilities) =>
          edit(capabilities, (roles) => setEntryEffort(roles, value.role, value.index, value.effort)),
      },
      'remove-entry': {
        payload: isRemoveEntryIntent,
        run: (_tab, value: { role: string; index: number }, capabilities) =>
          edit(capabilities, (roles) => removeEntry(roles, value.role, value.index)),
      },
      'move-entry': {
        payload: isMoveEntryIntent,
        run: (_tab, value: { role: string; from: number; to: number }, capabilities) =>
          edit(capabilities, (roles) => moveEntry(roles, value.role, value.from, value.to)),
      },
    }),
  };
}
