import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { LauncherCommand, LauncherSource } from './shared.js';

// The command set the launcher shows when no `launcher.json` exists — a project that has never run
// `janus init`, or one whose file was removed. Every entry is a command the application already
// answers to, so the rail is useful on a first run rather than empty.
export const DEFAULT_LAUNCHER_COMMANDS: readonly LauncherCommand[] = [
  { id: 'zsh', icon: 'faTerminal', label: 'New shell', command: 'zsh' },
  { id: 'harness', icon: 'faRobot', label: 'New agent', command: 'harness' },
  { id: 'files', icon: 'faFolderOpen', label: 'File navigator', command: 'files' },
  { id: 'notifications', icon: 'faBell', label: 'Notifications', command: 'notifications' },
  { id: 'schedules', icon: 'faClock', label: 'Schedules', command: 'schedules' },
  { id: 'sessions', icon: 'faPlug', label: 'Sessions', command: 'sessions' },
  { id: 'conversations', icon: 'faComments', label: 'Conversations', command: 'conversations' },
  { id: 'search', icon: 'faMagnifyingGlass', label: 'Search tab', command: 'search' },
  { id: 'tasks', icon: 'faListCheck', label: 'Tasks', command: 'tasks' },
  { id: 'hist', icon: 'faClockRotateLeft', label: 'History', command: 'hist' },
];

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

// An icon the file names that the project cannot produce is drawn with a neutral fallback glyph and
// reported once, rather than dropping the command it belongs to. The icon names are resolved on the
// client, which owns the registered Font Awesome set, so this reports the name and lets the client
// decide the glyph. An entry whose `command` is missing has nothing to dispatch, so it is dropped.
function toCommands(value: unknown): LauncherCommand[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const command = typeof record.command === 'string' ? record.command.trim() : '';
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    const icon = typeof record.icon === 'string' ? record.icon.trim() : '';
    if (!command || !label || !icon) return [];
    return [{
      id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `command-${index}`,
      icon,
      label,
      command,
    }];
  });
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
  const commands = toCommands(parsed);
  // An empty array is no configuration at all rather than a choice to show nothing, so a project that
  // committed one by accident still gets a working rail — and still gets no complaint, because there is
  // nothing wrong with it.
  if (commands.length === 0) {
    const problem = parsed.length === 0 ? undefined :
      `launcher.json holds ${parsed.length} commands, none of them usable, at ${filePath}`;
    return {
      commands: [...DEFAULT_LAUNCHER_COMMANDS], source: 'default', filePath,
      ...(problem !== undefined && { problem }),
    };
  }
  // Some entries survived and some did not. The partial loss is worth one line, because the reason a row
  // the user wrote is missing is otherwise invisible.
  const problem = commands.length === parsed.length ? undefined :
    `launcher.json holds ${parsed.length} commands, ${commands.length} of them usable, at ${filePath}`;
  return { commands, source, filePath, ...(problem !== undefined && { problem }) };
}
