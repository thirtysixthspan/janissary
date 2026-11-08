import type { ApplicationCommandDeclaration, ApplicationCommandRow } from './shared/application-commands.js';
import { commands } from './commands/index.js';
import { getOutput } from './commands.js';
import { tabPluginCatalog } from './plugins/catalog.js';
import { NATIVE_ACP_COMMANDS } from './plugins/roles/shared.js';
import { nativeCommandTool } from './acp/native-commands.js';
import type { TabPluginDeclaration } from './plugins/api.js';

const BUILTIN_FORMS: Readonly<Record<string, ApplicationCommandDeclaration>> = {
  agent: { name: 'agent', forms: ['agent'] }, ask: { name: 'ask', forms: ['ask'] },
  'ask-reset': { name: 'ask', forms: ['ask reset'], parent: 'ask' },
  browser: { name: 'browser', forms: ['browser'] }, clear: { name: 'clear', forms: ['clear'] },
  clipboard: { name: 'clipboard', forms: ['clipboard'] }, close: { name: 'close', forms: ['close'], aliases: ['exit'] },
  create: { name: 'create', forms: ['create'] }, db: { name: 'db', forms: ['db', 'db sqlite'] },
  edit: { name: 'edit', forms: ['edit'] }, execute: { name: 'execute', forms: ['execute'] },
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
  shell: { name: 'shell', forms: ['!'] }, ssh: { name: 'ssh', forms: ['ssh'] },
  syntax: { name: 'syntax', forms: ['syntax', 'syntax theme'] }, tab: { name: 'tab', forms: ['tab', 'tab focus', 'tab move', 'tab pane', 'tab split', 'tab color', 'tab group', 'tab dock', 'tab undock'] },
  tasks: { name: 'tasks', forms: ['tasks'] }, tell: { name: 'tell', forms: ['tell'] },
  'tell-reset': { name: 'tell', forms: ['tell reset'], parent: 'tell' },
  theme: { name: 'theme', forms: ['theme', 'theme sync'] }, question: { name: 'question', forms: ['question ask', 'question approve'] },
  monitor: { name: 'monitor', forms: ['monitor'] },
  unmonitor: { name: 'unmonitor', forms: ['unmonitor', 'unmonitor --all'] },
  monitors: { name: 'monitors', forms: ['monitors'] },
};

function normalize(value: string): string {
  return value.trim().replaceAll(/\s+/gu, ' ').toLowerCase();
}

function compare(left: ApplicationCommandRow, right: ApplicationCommandRow): number {
  return left.name.localeCompare(right.name);
}

export function listApplicationCommands(): ApplicationCommandRow[] {
  const rows: ApplicationCommandRow[] = [];
  for (const command of commands) {
    const declaration = BUILTIN_FORMS[command.name];
    if (declaration) rows.push({ ...declaration, kind: 'builtin', aliases: declaration.aliases ?? [] });
  }
  rows.push({ name: 'help', kind: 'help', aliases: [], forms: ['help', 'help commands', 'help keys', 'help <command>'], parent: 'help' });
  const registeredNames = new Set(commands.map((command) => command.name.toLowerCase()));
  const declarations: readonly TabPluginDeclaration[] = tabPluginCatalog;
  for (const plugin of declarations) {
    if (!plugin.command || !registeredNames.has(plugin.command.toLowerCase())) continue;
    const aliases = (plugin.commandAliases ?? []).filter((alias) => registeredNames.has(alias.toLowerCase()));
    rows.push({ name: plugin.command.toLowerCase(), kind: 'plugin', aliases, forms: [plugin.command, ...aliases] });
  }
  for (const name of NATIVE_ACP_COMMANDS) {
    const parent = name.split(' ').slice(0, -1).join(' ');
    rows.push({ name, kind: 'native', aliases: [], forms: [name], parent, nativeTool: nativeCommandTool(name) });
  }
  return rows.map((row) => ({ ...row, name: normalize(row.name), aliases: row.aliases.map((alias) => normalize(alias)), forms: row.forms.map((form) => normalize(form)), ...(row.parent && { parent: normalize(row.parent) }) }))
    .toSorted(compare);
}

export function resolveApplicationCommand(input: string): ApplicationCommandRow | undefined {
  const normalized = normalize(input);
  const rows = listApplicationCommands();
  const candidates = rows.filter((row) => [row.name, ...row.aliases, ...row.forms]
    .some((form) => normalized === form || normalized.startsWith(`${form} `)))
    .toSorted((left, right) => {
      const leftLength = Math.max(0, ...left.forms.filter((form) => normalized.startsWith(form)).map((form) => form.length));
      const rightLength = Math.max(0, ...right.forms.filter((form) => normalized.startsWith(form)).map((form) => form.length));
      return rightLength - leftLength;
    });
  const owner = candidates.find((row) => row.kind === 'builtin' && row.name === 'search' && normalized.startsWith('search transcript'))
    ?? candidates.find((row) => row.kind === 'plugin' && row.name === 'search')
    ?? candidates[0];
  if (!owner) return undefined;
  return { ...owner, forms: owner.forms.filter((form) => normalized === form || normalized.startsWith(`${form} `)) };
}

export function hasHelpFallback(input: string): boolean {
  return getOutput(input).kind !== 'silent';
}
