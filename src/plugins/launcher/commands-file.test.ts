import { describe, expect, it } from 'vitest';
import { readLauncherFile, createDefaultLauncherFile, DEFAULT_LAUNCHER_COMMANDS } from './commands-file.js';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

type Scratch = { project: string; home: string };

// Under the repository's own gitignored `temp/`, rather than the platform temporary directory: a
// sandbox a run may live in does not necessarily have one, and a scratch directory that cannot be
// created is a test that cannot run.
function scratch(): Scratch {
  mkdirSync(path.join(process.cwd(), 'temp'), { recursive: true });
  const root = mkdtempSync(path.join(process.cwd(), 'temp', 'launcher-commands-'));
  return {
    project: path.join(root, 'project'),
    home: path.join(root, 'home'),
  };
}

function cleanup(directories: Scratch): void {
  rmSync(path.dirname(directories.project), { recursive: true, force: true });
}

function projectFile(directories: Scratch, content: unknown | string): void {
  const directory = path.join(directories.project, '.janissary');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, 'launcher.json'),
    typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`,
  );
}

function homeFile(directories: Scratch, content: unknown | string): void {
  const directory = path.join(directories.home, '.janissary');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, 'launcher.json'),
    typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`,
  );
}

describe('reading launcher.json', () => {
  it('provides the default launcher commands in the requested order', () => {
    expect(DEFAULT_LAUNCHER_COMMANDS).toEqual([
      { id: 'zsh', icon: 'faTerminal', label: 'Shell', command: 'zsh' },
      { id: 'harness', icon: 'faRobot', label: 'Harness', command: 'harness' },
      { id: 'files', icon: 'faFolderOpen', label: 'File navigator', command: 'files left $root' },
      { id: 'sql', icon: 'faDatabase', label: 'SQL', command: 'sql' },
      { id: 'notifications', icon: 'faBell', label: 'Notifications', command: 'notifications right' },
      { id: 'schedules', icon: 'faClock', label: 'Schedules', command: 'schedules right' },
      { id: 'sessions', icon: 'faPlug', label: 'Sessions', command: 'sessions right' },
      { id: 'conversations', icon: 'faComments', label: 'Conversations', command: 'conversations' },
      { id: 'search', icon: 'faMagnifyingGlass', label: 'Search', command: 'search' },
    ]);
  });

  it('falls back to the default set when no file exists, and names where it would be written', () => {
    const directories = scratch();
    try {
      const read = readLauncherFile(directories.home, directories.project);

      expect(read.source).toBe('default');
      expect(read.commands).toEqual([...DEFAULT_LAUNCHER_COMMANDS]);
      expect(read.filePath).toBe(path.join(directories.project, '.janissary', 'launcher.json'));
      expect(read.problem).toBeUndefined();
    } finally {
      cleanup(directories);
    }
  });

  it("reads the project's own file, keeping the user's label and command verbatim", () => {
    const directories = scratch();
    try {
      projectFile(directories, [{ icon: 'faTerminal', label: 'My shell', command: 'zsh --no-workspace' }]);

      const read = readLauncherFile(directories.home, directories.project);

      expect(read.source).toBe('project');
      expect(read.commands).toEqual([
        { id: 'command-0', icon: 'faTerminal', label: 'My shell', command: 'zsh --no-workspace' },
      ]);
      expect(read.problem).toBeUndefined();
    } finally {
      cleanup(directories);
    }
  });

  // A user's own file replaces the project's wholesale rather than merging with it, so two people
  // sharing a project never have to work out which entry won.
  it("replaces the project's file with the user's own when one exists", () => {
    const directories = scratch();
    try {
      projectFile(directories, [{ icon: 'faTerminal', label: 'Project shell', command: 'zsh' }]);
      homeFile(directories, [{ icon: 'faRobot', label: 'Home agent', command: 'harness' }]);

      const read = readLauncherFile(directories.home, directories.project);

      expect(read.source).toBe('home');
      expect(read.filePath).toBe(path.join(directories.home, '.janissary', 'launcher.json'));
      expect(read.commands).toEqual([{ id: 'command-0', icon: 'faRobot', label: 'Home agent', command: 'harness' }]);
    } finally {
      cleanup(directories);
    }
  });

  // An icon that is not one this build draws still leaves the command in place: one bad name costs one
  // glyph, not one missing row.
  it('keeps a command whose icon the client will not recognise', () => {
    const directories = scratch();
    try {
      projectFile(directories, [{ icon: 'faNotAGlyph', label: 'Odd', command: 'tasks' }]);

      const read = readLauncherFile(directories.home, directories.project);

      expect(read.commands).toEqual([{ id: 'command-0', icon: 'faNotAGlyph', label: 'Odd', command: 'tasks' }]);
      expect(read.problem).toBeUndefined();
    } finally {
      cleanup(directories);
    }
  });

  it('keeps an entry whose id is absent, numbering it by position', () => {
    const directories = scratch();
    try {
      projectFile(directories, [
        { icon: 'faTerminal', label: 'One', command: 'zsh' },
        { icon: 'faRobot', label: 'Two', command: 'harness' },
      ]);

      const read = readLauncherFile(directories.home, directories.project);

      expect(read.commands.map((entry) => entry.id)).toEqual(['command-0', 'command-1']);
    } finally {
      cleanup(directories);
    }
  });

  // An id names exactly one row: `run-command` resolves it back to the first entry holding it, and the
  // client keys a row by it. Two rows sharing one are two rows that only look different — a click on
  // the second runs the first's command.
  it('keeps the first row and drops the rest when the file names one id twice', () => {
    const directories = scratch();
    try {
      projectFile(directories, [
        { id: 'shell', icon: 'faTerminal', label: 'Zsh', command: 'zsh' },
        { id: 'shell', icon: 'faBell', label: 'Alerts', command: 'notifications left' },
        { id: 'tasks', icon: 'faListCheck', label: 'Tasks', command: 'tasks' },
      ]);

      const read = readLauncherFile(directories.home, directories.project);

      expect(read.commands.map((entry) => entry.command)).toEqual(['zsh', 'tasks']);
      expect(read.problem).toContain('1 sharing an id another entry already holds');
      expect(read.problem).toContain('holds 3 commands');
    } finally {
      cleanup(directories);
    }
  });

  // The other half of the same collision: an id the file wrote by hand lands on the one an unnamed
  // entry gets for free. The file's own naming wins, and the unnamed entry takes a free positional id
  // rather than silently becoming a second `command-1`.
  it('lets the id the file wrote win over the positional one it would collide with', () => {
    const directories = scratch();
    try {
      projectFile(directories, [
        { id: 'command-1', icon: 'faTerminal', label: 'One', command: 'zsh' },
        { icon: 'faRobot', label: 'Two', command: 'harness' },
      ]);

      const read = readLauncherFile(directories.home, directories.project);

      const ids = read.commands.map((entry) => entry.id);
      expect(ids).toEqual(['command-1', 'command-1-2']);
      expect(new Set(ids).size).toBe(2);
      expect(read.problem).toBeUndefined();
    } finally {
      cleanup(directories);
    }
  });

  // The one line names both reasons a row the user wrote is missing, because they read very
  // differently: an entry that was malformed and a well-formed entry that could not hold an id of its
  // own.
  it('names a dropped duplicate beside an entry that was malformed', () => {
    const directories = scratch();
    try {
      projectFile(directories, [
        { id: 'tasks', icon: 'faListCheck', label: 'One', command: 'tasks' },
        { id: 'tasks', icon: 'faBell', label: 'Two', command: 'notifications left' },
        { icon: 'faRobot', label: 'No command' },
      ]);

      const read = readLauncherFile(directories.home, directories.project);

      expect(read.commands.map((entry) => entry.command)).toEqual(['tasks']);
      expect(read.problem).toContain('1 of 2 of them usable');
      expect(read.problem).toContain('1 sharing an id another entry already holds');
    } finally {
      cleanup(directories);
    }
  });

  it('drops an entry with nothing to dispatch, keeping the rest', () => {
    const directories = scratch();
    try {
      projectFile(directories, [
        { icon: 'faTerminal', label: 'Kept', command: 'zsh' },
        { icon: 'faRobot', label: 'No command' },
        { icon: 'faBell', label: 'Empty command', command: ' ' },
        'not even an object',
      ]);

      const read = readLauncherFile(directories.home, directories.project);

      expect(read.commands).toEqual([{ id: 'command-0', icon: 'faTerminal', label: 'Kept', command: 'zsh' }]);
    } finally {
      cleanup(directories);
    }
  });

  it('reports invalid JSON, leaves the file alone, and still shows the default set', () => {
    const directories = scratch();
    try {
      projectFile(directories, '{ not json at all');

      const read = readLauncherFile(directories.home, directories.project);

      expect(read.source).toBe('default');
      expect(read.commands).toEqual([...DEFAULT_LAUNCHER_COMMANDS]);
      expect(read.problem).toContain('not valid JSON');
      expect(read.problem).toContain('launcher.json');
    } finally {
      cleanup(directories);
    }
  });

  it('reports a file whose top level is not a list', () => {
    const directories = scratch();
    try {
      projectFile(directories, { commands: [] });

      const read = readLauncherFile(directories.home, directories.project);

      expect(read.source).toBe('default');
      expect(read.problem).toContain('not a list of commands');
    } finally {
      cleanup(directories);
    }
  });

  // An empty array is treated as no configuration at all rather than as a choice to show nothing, so a
  // project that committed one by accident still gets a working rail.
  it('treats an empty array as no configuration at all', () => {
    const directories = scratch();
    try {
      projectFile(directories, []);

      const read = readLauncherFile(directories.home, directories.project);

      expect(read.source).toBe('default');
      expect(read.commands).toEqual([...DEFAULT_LAUNCHER_COMMANDS]);
      expect(read.problem).toBeUndefined();
    } finally {
      cleanup(directories);
    }
  });

  it('reports a file that cannot be read, and still shows the default set', () => {
    const directories = scratch();
    try {
      // A directory in a file's place cannot be read as one, which is the closest a test gets to an
      // unreadable file without changing permissions.
      const directory = path.join(directories.project, '.janissary', 'launcher.json');
      mkdirSync(directory, { recursive: true });

      const read = readLauncherFile(directories.home, directories.project);

      expect(read.source).toBe('default');
      expect(read.problem).toContain('could not be read');
    } finally {
      cleanup(directories);
    }
  });
});

describe('creating launcher.json for editing', () => {
  it('creates the parent directory and writes the default command entries', () => {
    const directories = scratch();
    const filePath = path.join(directories.project, '.janissary', 'launcher.json');
    try {
      createDefaultLauncherFile(filePath);

      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, 'utf8')).toBe(`${JSON.stringify(
        DEFAULT_LAUNCHER_COMMANDS.map(({ icon, label, command }) => ({ icon, label, command })), null, 2,
      )}\n`);
    } finally {
      cleanup(directories);
    }
  });

  it('leaves an existing launcher file untouched', () => {
    const directories = scratch();
    const content = [{ icon: 'faTerminal', label: 'My shell', command: 'zsh --login' }];
    const filePath = path.join(directories.project, '.janissary', 'launcher.json');
    try {
      projectFile(directories, content);

      createDefaultLauncherFile(filePath);

      expect(readFileSync(filePath, 'utf8')).toBe(`${JSON.stringify(content, null, 2)}\n`);
    } finally {
      cleanup(directories);
    }
  });
});
