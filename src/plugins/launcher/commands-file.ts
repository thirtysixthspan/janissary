import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { LauncherCommand, LauncherSource } from './shared.js';

// The command set the launcher shows when no `launcher.json` exists — a project that has never run
// `janus init`, or one whose file was removed. Every entry is a command the application already
// answers to, so the rail is useful on a first run rather than empty.
export const DEFAULT_LAUNCHER_COMMANDS: readonly LauncherCommand[] = [
  { id: 'zsh', icon: 'faTerminal', label: 'Shell', command: 'zsh' },
  { id: 'harness', icon: 'faRobot', label: 'Harness', command: 'harness' },
  { id: 'files', icon: 'faFolderOpen', label: 'File navigator', command: 'files left $root' },
  { id: 'sql', icon: 'faDatabase', label: 'SQL', command: 'sql' },
  { id: 'notifications', icon: 'faBell', label: 'Notifications', command: 'notifications right' },
  { id: 'schedules', icon: 'faClock', label: 'Schedules', command: 'schedules right' },
  { id: 'sessions', icon: 'faPlug', label: 'Sessions', command: 'sessions right' },
  { id: 'conversations', icon: 'faComments', label: 'Conversations', command: 'conversations' },
  { id: 'search', icon: 'faMagnifyingGlass', label: 'Search', command: 'search' },
];

// Create the file the Configure action is about to open, using the same entries `janus init` seeds.
// Exclusive creation keeps a file written by the user between the existence check and this write.
export function createDefaultLauncherFile(filePath: string): void {
  if (existsSync(filePath)) return;
  mkdirSync(path.dirname(filePath), { recursive: true });
  const contents = `${JSON.stringify(
    DEFAULT_LAUNCHER_COMMANDS.map(({ icon, label, command }) => ({ icon, label, command })), null, 2,
  )}\n`;
  try {
    writeFileSync(filePath, contents, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}

// The file name under both the project's `.janissary/` and the user's home `.janissary/`.
const FILE_NAME = 'launcher.json';

// What reading the effective file produced: which file it was, what it holds, and — when the file
// could not be used — one sentence saying so. `commands` is the default set whenever `source` is
// `default`, so a caller never has to distinguish "no file" from "broken file" to render.
export type LauncherFileRead = {
  commands: LauncherCommand[];
  source: LauncherSource;
  filePath: string;
  problem?: string;
};

// The user's own file replaces the project's wholesale when it exists. That is a deliberate
// asymmetry: a home file is the user's own preference over a project's committed rail, which is the
// same precedence `.janissary/config.json` settings have over a project's expectations, and a merge
// would leave the user guessing which project entry won.
function resolveSource(home: string, root: string): { path: string; source: LauncherSource } {
  const homePath = path.join(home, '.janissary', FILE_NAME);
  if (existsSync(homePath)) return { path: homePath, source: 'home' };
  const projectPath = path.join(root, '.janissary', FILE_NAME);
  if (existsSync(projectPath)) return { path: projectPath, source: 'project' };
  return { path: projectPath, source: 'default' };
}

// An entry as the file shaped it, before an id is decided. `id` is what the file named, if anything.
type CommandDraft = { id?: string; icon: string; label: string; command: string };

// An icon the file names that the project cannot produce is drawn with a neutral fallback glyph and
// reported once, rather than dropping the command it belongs to. The icon names are resolved on the
// client, which owns the registered Font Awesome set, so this reports the name and lets the client
// decide the glyph. An entry whose `command` is missing has nothing to dispatch, so it is dropped.
function decodeCommands(value: unknown): CommandDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const command = typeof record.command === 'string' ? record.command.trim() : '';
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    const icon = typeof record.icon === 'string' ? record.icon.trim() : '';
    if (!command || !label || !icon) return [];
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    return [{ ...(id && { id }), icon, label, command }];
  });
}

// Every id has to name exactly one row. `run-command` resolves an id back to the first entry holding
// it, the client keys a row by it, and two rows sharing one are two rows that only look different — a
// click on the second runs the first's command.
//
// The file's own ids are claimed first, in file order, so a positional id never displaces a name the
// user wrote; a second row naming one already claimed is dropped, because a row that cannot be
// addressed on its own is not a row at all. A positional id then yields to anything already taken.
// Returns how many rows were dropped for holding an id another row already held.
function withUniqueIds(drafts: readonly CommandDraft[]): { commands: LauncherCommand[]; ambiguous: number } {
  const taken = new Set<string>();
  const ids: (string | undefined)[] = drafts.map((draft) => draft.id);
  const shadowed = new Set<number>();
  for (const [index, draft] of drafts.entries()) {
    const id = draft.id;
    if (id === undefined) continue;
    // A second row naming one already claimed is dropped, because a row that cannot be addressed on
    // its own is not a row at all: resolving its id would run the first row's command.
    if (taken.has(id)) {
      shadowed.add(index);
      ids[index] = undefined;
      continue;
    }
    taken.add(id);
  }
  for (const index of drafts.keys()) {
    if (shadowed.has(index) || ids[index] !== undefined) continue;
    let id = `command-${index}`;
    for (let suffix = 2; taken.has(id); suffix += 1) id = `command-${index}-${suffix}`;
    taken.add(id);
    ids[index] = id;
  }
  return {
    commands: drafts.flatMap((draft, index) => {
      const id = ids[index];
      return id === undefined ? [] : [{ ...draft, id }];
    }),
    ambiguous: shadowed.size,
  };
}

// One line naming what was wrong with the file, for the caller to report exactly once. Ambiguity is
// named on its own rather than folded into "not usable", because the reason a row the user wrote is
// missing is otherwise invisible: every entry in the file may be well-formed and two of them still
// cannot both hold one id.
function fileProblem(usable: number, total: number, ambiguous: number, filePath: string): string | undefined {
  if (usable === total) return undefined;
  const malformed = total - ambiguous;
  const parts = [`holds ${total} commands`];
  if (usable !== malformed) parts.push(`${usable} of ${malformed} of them usable`);
  if (ambiguous > 0) parts.push(`${ambiguous} sharing an id another entry already holds`);
  return `launcher.json ${parts.join(', ')}, at ${filePath}`;
}

// Read the effective `launcher.json` against `root`, the project root `originTab` reports. An absent
// file, an unreadable one, one that is not valid JSON, one whose top level is not an array, and one
// that is a valid but empty array all answer the default command set — an empty array is treated as
// no configuration at all rather than as a choice to show nothing, so a project that committed one by
// accident still gets a working rail. One line naming what was wrong is carried in `problem`, for
// the caller to report to the notifications feed exactly once.
export function readLauncherFile(home: string, root: string): LauncherFileRead {
  const { path: filePath, source } = resolveSource(home, root);
  if (source === 'default') {
    return { commands: [...DEFAULT_LAUNCHER_COMMANDS], source, filePath };
  }
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return {
      commands: [...DEFAULT_LAUNCHER_COMMANDS], source: 'default', filePath,
      problem: `launcher.json could not be read at ${filePath}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      commands: [...DEFAULT_LAUNCHER_COMMANDS], source: 'default', filePath,
      problem: `launcher.json is not valid JSON at ${filePath}`,
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      commands: [...DEFAULT_LAUNCHER_COMMANDS], source: 'default', filePath,
      problem: `launcher.json is not a list of commands at ${filePath}`,
    };
  }
  const { commands, ambiguous } = withUniqueIds(decodeCommands(parsed));
  const problem = fileProblem(commands.length, parsed.length, ambiguous, filePath);
  // An empty array is no configuration at all rather than a choice to show nothing, so a project that
  // committed one by accident still gets a working rail — and still gets no complaint, because there is
  // nothing wrong with it. The same fallback answers a file whose every entry was dropped, whether for
  // being malformed or for holding an id another entry already holds.
  if (commands.length === 0) {
    return {
      commands: [...DEFAULT_LAUNCHER_COMMANDS],
      source: 'default',
      filePath,
      ...(problem !== undefined && { problem }),
    };
  }
  // Some entries survived and some did not. The partial loss is worth one line, because the reason a row
  // the user wrote is missing is otherwise invisible.
  return { commands, source, filePath, ...(problem !== undefined && { problem }) };
}
