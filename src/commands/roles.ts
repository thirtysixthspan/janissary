import { homedir } from 'node:os';
import type { Command } from './types.js';
import { appendCommandOutput } from '../command/append.js';
import { EFFORT_LEVELS } from '../harness/effort-levels.js';
import { HARNESS_NAMES } from '../harness/index.js';
import { readRolesFile } from '../plugins/roles/roles-file.js';
import type { LaunchCatalog, Role } from '../plugins/roles/shared.js';

export const ROLES_LIST_USAGE = 'Usage: roles list';

type RoleListing = {
  name: string;
  description: string;
  models: Array<{ harness: string; model: string; effort?: string }>;
  commands: string[];
};

export function rolesListing(roles: readonly Role[], catalog: LaunchCatalog): { roles: RoleListing[] } {
  return {
    roles: roles.map((role) => ({
      name: role.name,
      description: role.description,
      models: role.entries
        .filter((entry) => catalog.models[entry.harness]?.includes(entry.model) ?? false)
        .map(({ harness, model, effort }) => ({ harness, model, ...(effort !== undefined && { effort }) })),
      commands: [...role.commands],
    })),
  };
}

export const command: Command = {
  name: 'roles',
  match: (input) => /^roles\s+list\b/i.test(input),
  samples: ['roles list'],
  run: (input, tab, managers, invocation) => {
    const append = (output: string) => appendCommandOutput(managers, tab.label, { input, output }, invocation);
    const argument = input.replace(/^roles\s+list\b\s*/i, '').trim();
    if (argument) { append(ROLES_LIST_USAGE); return; }
    managers.models.reload();
    const catalog: LaunchCatalog = {
      models: Object.fromEntries(HARNESS_NAMES.map((name) => [name, managers.models.modelsFor(name)])),
      efforts: [...EFFORT_LEVELS],
    };
    const read = readRolesFile(homedir(), managers.tab.launchDir, { create: false });
    append(JSON.stringify(rolesListing(read.roles, catalog), null, 2));
  },
};
