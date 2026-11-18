import type { ApplicationCommandDeclaration, ApplicationCommandRow } from './shared/application-commands.js';
import { COMMAND_FORMS } from './commands/forms.js';
import { coreCommands, pluginCommandClaims } from './commands/index.js';
import { tabPluginCatalog } from './plugins/catalog.js';
import { NATIVE_ACP_COMMANDS } from './plugins/roles/shared.js';
import { nativeCommandTool } from './acp/native-commands.js';
import type { TabPluginDeclaration } from './plugins/api.js';
import { atFormBoundary, normalizeCommandName, rankCommandRows } from './shared/command-matching.js';

function builtinRows(declaration: ApplicationCommandDeclaration): ApplicationCommandRow[] {
  const aliases = declaration.aliases ?? [];
  const [first, ...rest] = declaration.forms;
  if (declaration.parent !== undefined || first !== declaration.name) {
    return [{ ...declaration, kind: 'builtin', aliases }];
  }
  return [
    { ...declaration, kind: 'builtin', aliases, forms: [first] },
    ...rest.map((form): ApplicationCommandRow => ({
      name: form, kind: 'builtin', aliases: [], forms: [form], parent: declaration.name,
    })),
  ];
}

function compare(left: ApplicationCommandRow, right: ApplicationCommandRow): number {
  return left.name.localeCompare(right.name);
}

function buildApplicationCommands(): ApplicationCommandRow[] {
  const rows: ApplicationCommandRow[] = [];
  for (const command of coreCommands) {
    const declaration = COMMAND_FORMS[command.name];
    if (declaration) rows.push(...builtinRows(declaration));
  }
  rows.push({ name: 'help', kind: 'help', aliases: [], forms: ['help', 'help commands', 'help keys', 'help <command>'], parent: 'help' });
  const declarations: readonly TabPluginDeclaration[] = tabPluginCatalog;
  for (const plugin of declarations) {
    const accepted = new Set(pluginCommandClaims
      .filter((claim) => claim.declarationId === plugin.id)
      .map((claim) => claim.name));
    if (!plugin.command || !accepted.has(plugin.command.toLowerCase())) continue;
    const aliases = (plugin.commandAliases ?? []).filter((alias) => accepted.has(alias.toLowerCase()));
    rows.push({ name: plugin.command.toLowerCase(), kind: 'plugin', aliases, forms: [plugin.command, ...aliases] });
  }
  for (const name of NATIVE_ACP_COMMANDS) {
    const parent = name.split(' ').slice(0, -1).join(' ');
    rows.push({ name, kind: 'native', aliases: [], forms: [name], ...(parent && { parent }), nativeTool: nativeCommandTool(name) });
  }
  return rows.map((row) => ({ ...row, name: normalizeCommandName(row.name), aliases: row.aliases.map((alias) => normalizeCommandName(alias)), forms: row.forms.map((form) => normalizeCommandName(form)), ...(row.parent && { parent: normalizeCommandName(row.parent) }) }))
    .toSorted(compare);
}

let inventory: ApplicationCommandRow[] | undefined;

export function listApplicationCommands(): ApplicationCommandRow[] {
  inventory ??= buildApplicationCommands();
  return inventory;
}

export function resolveExactApplicationCommand(input: string): ApplicationCommandRow | undefined {
  const row = resolveApplicationCommand(input);
  const normalized = normalizeCommandName(input);
  return row && [row.name, ...row.aliases, ...row.forms].includes(normalized) ? row : undefined;
}

export function resolveApplicationCommand(input: string): ApplicationCommandRow | undefined {
  const normalized = normalizeCommandName(input);
  const rows = listApplicationCommands();
  const candidates = rankCommandRows(rows, normalized);
  const owner = candidates.find((row) => row.kind === 'builtin' && row.name === 'search' && normalized.startsWith('search transcript'))
    ?? candidates.find((row) => row.kind === 'plugin' && row.name === 'search')
    ?? candidates[0];
  if (!owner) return undefined;
  return { ...owner, forms: owner.forms.filter((form) => atFormBoundary(normalized, form)) };
}
