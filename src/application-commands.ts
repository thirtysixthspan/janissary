import type { ApplicationCommandDeclaration, ApplicationCommandRow } from './shared/application-commands.js';
import { coreCommands, pluginCommandClaims } from './commands/index.js';
import { tabPluginCatalog } from './plugins/catalog.js';
import { NATIVE_ACP_COMMANDS } from './plugins/roles/shared.js';
import { nativeCommandTool } from './acp/native-commands.js';
import type { TabPluginDeclaration } from './plugins/api.js';
import { atFormBoundary, normalizeCommandName, rankCommandRows } from './shared/command-matching.js';

const BUILTIN_FORMS: Readonly<Record<string, ApplicationCommandDeclaration>> = {
  agent: { name: 'agent', forms: ['agent'] }, ask: { name: 'ask', forms: ['ask'] },
  'ask-reset': { name: 'ask', forms: ['ask reset'], parent: 'ask' },
  browser: { name: 'browser', forms: ['browser'] }, clear: { name: 'clear', forms: ['clear'] },
  clipboard: { name: 'clipboard', forms: ['clipboard'] }, close: { name: 'close', forms: ['close'], aliases: ['exit'] },
  create: { name: 'create', forms: ['create'] }, db: { name: 'db', forms: ['db', 'db sqlite'] },
  edit: { name: 'edit', forms: ['edit'] }, execute: { name: 'execute', forms: ['execute'] },
  file: { name: 'file', forms: ['file'] },
  files: { name: 'files', forms: ['files', 'files expand', 'files collapse', 'files cursor', 'files anchor', 'files select'] },
  harness: { name: 'harness', forms: ['harness'] }, hist: { name: 'hist', forms: ['hist'] },
  layout: { name: 'layout', forms: ['layout', 'layout window', 'layout sidebar', 'layout split', 'layout reporting', 'layout show'] },
  newdir: { name: 'newdir', forms: ['newdir'] }, newfile: { name: 'newfile', forms: ['newfile'] },
  next: { name: 'next', forms: ['next'] }, notifications: { name: 'notifications', forms: ['notifications', 'notifications left', 'notifications right', 'notifications clear'] },
  notify: { name: 'notify', forms: ['notify'] }, open: { name: 'open', forms: ['open', 'open external', 'open page'] },
  play: { name: 'play', forms: ['play'] }, plugins: { name: 'plugins', forms: ['plugins', 'plugins list'] },
  profile: { name: 'profile', forms: ['profile', 'profile list'] }, queue: { name: 'queue', forms: ['queue', 'queue list'] },
  quit: { name: 'quit', forms: ['quit'] }, rename: { name: 'rename', forms: ['rename'] },
  schedule: { name: 'schedule', forms: ['schedule', 'schedule list', 'schedule cancel', 'schedule clear'] },
  search: { name: 'search', forms: ['search transcript'], parent: 'search' }, send: { name: 'send', forms: ['send'] },
  ssh: { name: 'ssh', forms: ['ssh'] },
  syntax: { name: 'syntax', forms: ['syntax', 'syntax theme'] }, tab: { name: 'tab', forms: ['tab', 'tab focus', 'tab move', 'tab pane', 'tab split', 'tab color', 'tab group', 'tab dock', 'tab undock'] },
  tasks: { name: 'tasks', forms: ['tasks'] }, tell: { name: 'tell', forms: ['tell'] },
  'tell-reset': { name: 'tell', forms: ['tell reset'], parent: 'tell' },
  theme: { name: 'theme', forms: ['theme', 'theme sync'] }, question: { name: 'question', forms: ['question ask', 'question approve'] },
  monitor: { name: 'monitor', forms: ['monitor'] },
  unmonitor: { name: 'unmonitor', forms: ['unmonitor', 'unmonitor --all'] },
  monitors: { name: 'monitors', forms: ['monitors'] },
};

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
    const declaration = BUILTIN_FORMS[command.name];
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
    rows.push({ name, kind: 'native', aliases: [], forms: [name], parent, nativeTool: nativeCommandTool(name) });
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
