import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as FileSystem from 'node:fs';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_ROLES, readRolesFile, writeRolesFile } from './roles-file.js';
import type { Role } from './shared.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync), renameSync: vi.fn(actual.renameSync) };
});

afterEach(() => { vi.mocked(writeFileSync).mockClear(); vi.mocked(renameSync).mockClear(); });

function directories(): { home: string; root: string } {
  const base = mkdtempSync(path.join(tmpdir(), 'janus-roles-file-'));
  const home = path.join(base, 'home');
  const root = path.join(base, 'project');
  mkdirSync(home, { recursive: true });
  mkdirSync(root, { recursive: true });
  return { home, root };
}

const homeFile = (home: string) => path.join(home, '.janissary', 'roles.json');
const projectFile = (root: string) => path.join(root, '.janissary', 'roles.json');

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, typeof value === 'string' ? value : JSON.stringify(value, undefined, 2));
}

function readJson(filePath: string): Record<string, { description: string; entries: unknown[]; commands: string[] }> {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

const A_ROLE: Role = { name: 'review', description: 'Second pair of eyes.', entries: [], commands: [] };

describe('reading the roles in effect', () => {
  it('creates the home file with the default roles when neither file exists', () => {
    const { home, root } = directories();
    const read = readRolesFile(home, root);

    expect(read.source).toBe('home');
    expect(read.path).toBe(homeFile(home));
    expect(read.problem).toBeUndefined();
    expect(read.roles).toEqual(DEFAULT_ROLES);
    expect(readJson(homeFile(home))['planning'].entries).toHaveLength(2);
    expect(Object.keys(readJson(homeFile(home)))).toEqual(DEFAULT_ROLES.map((role) => role.name));
  });

  it('creates seven default roles with the exact ask and tell entries and grants', () => {
    const { home, root } = directories();
    readRolesFile(home, root);

    const file = readJson(homeFile(home));
    expect(Object.keys(file)).toEqual([
      'planning', 'research', 'code review', 'implementation', 'documentation', 'ask', 'tell',
    ]);
    expect(file['ask']).toEqual({
      description: 'When you ask a question via ACP.',
      entries: [
        { harness: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: 'medium' },
        { harness: 'claude', model: 'claude-haiku-4-5', effort: 'high' },
        { harness: 'codex', model: 'gpt-6-luna', effort: 'high' },
      ],
      commands: [
        'db sqlite list', 'db sqlite query', 'browser goto', 'browser content',
        'question ask', 'question approve', 'file read', 'file glob',
      ],
    });
    expect(file['tell']).toEqual({
      description: 'When you tell a model to carry out a task via ACP.',
      entries: file['ask'].entries,
      commands: [
        'db sqlite create', 'db sqlite delete', 'db sqlite query', 'db sqlite list',
        'browser goto', 'browser content', 'browser eval', 'question ask', 'question approve', 'file read',
        'file glob', 'file write', 'file edit',
      ],
    });
    expect(DEFAULT_ROLES.slice(0, 5).every((role) => role.commands.length === 0)).toBe(true);
  });

  it('answers the default roles without writing a file when asked not to create one', () => {
    const { home, root } = directories();
    const read = readRolesFile(home, root, { create: false });

    expect(read.source).toBe('default');
    expect(read.problem).toBeUndefined();
    expect(read.roles).toEqual(DEFAULT_ROLES);
    expect(existsSync(homeFile(home))).toBe(false);
  });

  it('leaves an existing ask and tell role without file read untouched on disk', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), {
      ask: { description: 'Questions.', entries: [], commands: ['question ask'] },
      tell: { description: 'Tasks.', entries: [], commands: ['browser goto', 'question approve'] },
    });
    const before = readFileSync(homeFile(home), 'utf8');

    const read = readRolesFile(home, root);

    expect(read.roles.map((role) => role.commands)).toEqual([['question ask'], ['browser goto', 'question approve']]);
    expect(readFileSync(homeFile(home), 'utf8')).toBe(before);
  });

  it('leaves a saved ask and tell role without file glob untouched on disk', () => {
    const { home, root } = directories();
    const ask = [
      'db sqlite list', 'db sqlite query', 'browser goto', 'browser content',
      'question ask', 'question approve', 'file read',
    ];
    const tell = [
      'db sqlite create', 'db sqlite delete', 'db sqlite query', 'db sqlite list',
      'browser goto', 'browser content', 'browser eval', 'question ask', 'question approve', 'file read',
      'file write', 'file edit',
    ];
    writeJson(homeFile(home), {
      ask: { description: 'Questions.', entries: [], commands: ask },
      tell: { description: 'Tasks.', entries: [], commands: tell },
    });
    const before = readFileSync(homeFile(home), 'utf8');

    const read = readRolesFile(home, root);

    expect(read.roles.map((role) => role.commands)).toEqual([ask, tell]);
    expect(readFileSync(homeFile(home), 'utf8')).toBe(before);
  });

  it('keeps a saved tell role without file write or file edit as it is on disk', () => {
    const { home, root } = directories();
    const saved = [
      'db sqlite create', 'db sqlite delete', 'db sqlite query', 'db sqlite list',
      'browser goto', 'browser content', 'browser eval', 'question ask', 'question approve', 'file read',
    ];
    writeJson(homeFile(home), { tell: { description: 'Tasks.', entries: [], commands: saved } });
    const before = readFileSync(homeFile(home), 'utf8');

    const read = readRolesFile(home, root);

    expect(read.roles[0]?.commands).toEqual(saved);
    expect(readFileSync(homeFile(home), 'utf8')).toBe(before);
  });

  it('keeps file write on a saved ask role', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { ask: { description: 'Questions.', entries: [], commands: ['file write'] } });

    expect(readRolesFile(home, root).roles[0]?.commands).toEqual(['file write']);
  });

  it('reads the home file when it is the only one', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { review: { description: 'Second pair of eyes.', entries: [] } });

    const read = readRolesFile(home, root);

    expect(read.source).toBe('home');
    expect(read.roles).toEqual([A_ROLE]);
  });

  it('replaces the home roles entirely with the project file, including an empty one', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { review: { description: 'Second pair of eyes.', entries: [] } });
    writeJson(projectFile(root), { planning: { description: 'Plans.', entries: [] } });

    const replaced = readRolesFile(home, root);
    expect(replaced.source).toBe('project');
    expect(replaced.roles.map((role) => role.name)).toEqual(['planning']);

    writeJson(projectFile(root), {});
    const emptied = readRolesFile(home, root);
    expect(emptied.source).toBe('project');
    expect(emptied.roles).toEqual([]);
    expect(emptied.problem).toBeUndefined();
  });

  it('keeps the roles that decode and reports the ones that do not', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), {
      review: { description: 'Second pair of eyes.', entries: [{ harness: 'codex', model: 'gpt-6-sol' }, { effort: 'xhigh' }] },
      broken: { description: 'No entries list.' },
      'bad-command-list': { description: 'Invalid command list.', entries: [], commands: 'browser goto' },
      'bad-command-item': { description: 'Invalid command item.', entries: [], commands: ['browser goto', 7] },
    });

    const read = readRolesFile(home, root);

    expect(read.roles).toEqual([{ ...A_ROLE, entries: [{ harness: 'codex', model: 'gpt-6-sol' }] }]);
    expect(read.problem).toBe(
      `roles.json dropped 4 malformed roles or entries at ${homeFile(home)} — showing the rest of this file.`,
    );
    expect(read.unusablePath).toBe(homeFile(home));
  });

  it('falls back along the chain and names the file that broke', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { review: { description: 'Second pair of eyes.', entries: [] } });
    mkdirSync(path.dirname(projectFile(root)), { recursive: true });
    writeFileSync(projectFile(root), '{ broken', 'utf8');

    const fromHome = readRolesFile(home, root);
    expect(fromHome.source).toBe('home');
    expect(fromHome.problem).toBe(`roles.json is not valid JSON at ${projectFile(root)} — showing the home roles file.`);
    expect(fromHome.roles).toEqual([A_ROLE]);

    writeFileSync(projectFile(root), '{ broken too', 'utf8');
    writeFileSync(homeFile(home), '{ broken', 'utf8');
    const defaults = readRolesFile(home, root);
    expect(defaults.source).toBe('default');
    expect(defaults.roles).toEqual(DEFAULT_ROLES);
    expect(defaults.path).toBe(homeFile(home));
    expect(defaults.unusablePath).toBe(defaults.path);
    expect(defaults.problem).toBe(
      `roles.json is not valid JSON at ${projectFile(root)} — showing default roles.`,
    );
  });

  it('leaves the file that took over editable, naming only the damaged file unusable', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { review: { description: 'Second pair of eyes.', entries: [] } });
    mkdirSync(path.dirname(projectFile(root)), { recursive: true });
    writeFileSync(projectFile(root), '{ broken', 'utf8');

    const fromHome = readRolesFile(home, root);
    expect(fromHome.source).toBe('home');
    expect(fromHome.path).toBe(homeFile(home));
    expect(fromHome.unusablePath).toBeUndefined();

    const partlyDamaged = JSON.stringify({
      review: { description: 'Second pair of eyes.', entries: [] },
      broken: { description: 'No entries list.' },
    }, undefined, 2);
    writeFileSync(homeFile(home), partlyDamaged, 'utf8');
    const damagedFallback = readRolesFile(home, root);
    expect(damagedFallback.source).toBe('home');
    expect(damagedFallback.unusablePath).toBe(homeFile(home));
  });

  it('leaves a broken file untouched on disk', () => {
    const { home, root } = directories();
    mkdirSync(path.join(home, '.janissary'), { recursive: true });
    writeFileSync(homeFile(home), '{ broken', 'utf8');

    readRolesFile(home, root);

    expect(readFileSync(homeFile(home), 'utf8')).toBe('{ broken');
  });

  it('reports a file that is not a set of roles', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), ['not', 'a', 'set']);

    const read = readRolesFile(home, root);

    expect(read.source).toBe('default');
    expect(read.problem).toBe(`roles.json is not a set of roles at ${homeFile(home)} — showing default roles.`);
  });

  it('reports a roles path that cannot be read as a creation problem', () => {
    const { home, root } = directories();
    mkdirSync(path.join(home, '.janissary'), { recursive: true });
    // A directory where the file belongs makes every write of it fail, including the creation.
    mkdirSync(homeFile(home), { recursive: true });

    const read = readRolesFile(home, root);

    expect(read.source).toBe('default');
    expect(read.roles).toEqual(DEFAULT_ROLES);
    expect(read.problem).toContain(`roles.json could not be read at ${homeFile(home)} — showing default roles.`);
  });
});

describe('writing the roles in effect', () => {
  it('round trips special and numeric names in the supplied order with all role data intact', () => {
    const { home, root } = directories();
    const file = projectFile(root);
    const roles = ['10', 'review', '__proto__', '2', 'a"b', String.raw`c\d`, '1'].map((name) => ({
      name, description: `Description for ${name}.`, commands: ['future command', 'browser goto', 'future command'],
      entries: [{ harness: 'codex', model: 'same', effort: 'xhigh' }, { harness: 'codex', model: 'same' }],
    }));

    expect(writeRolesFile(file, roles)).toBe(true);
    const text = readFileSync(file, 'utf8');
    const positions = roles.map(({ name }) => text.indexOf(`${JSON.stringify(name)}:`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual(positions.toSorted((left, right) => left - right));
    expect(Object.hasOwn(readJson(file), '__proto__')).toBe(true);
    expect(readRolesFile(home, root).roles).toEqual(roles);
  });

  it('reads hand-written keys in textual order and retains last-value JSON semantics', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), String.raw`{
      "10": {"description":"Earlier", "entries":[]},
      "__proto__": {"description":"Nested punctuation }, \"2\": [", "entries":[{"harness":"codex","model":"same"},{"harness":"codex","model":"same"}]},
      "\u0032": {"description":"Two", "entries":[]},
      "10": {"description":"Later", "entries":[]}
    }`);

    const read = readRolesFile(home, root);
    expect(read.problem).toBeUndefined();
    expect(read.roles.map(({ name }) => name)).toEqual(['10', '__proto__', '2']);
    expect(read.roles[0].description).toBe('Later');
    expect(read.roles[1].description).toBe('Nested punctuation }, "2": [');
    expect(read.roles[1].entries).toEqual([{ harness: 'codex', model: 'same' }, { harness: 'codex', model: 'same' }]);
  });

  it('preserves the original and removes partial temporary output after a write failure', async () => {
    const { home, root } = directories();
    const file = homeFile(home);
    writeJson(file, { review: { description: A_ROLE.description, entries: [] } });
    const before = readFileSync(file, 'utf8');
    const actual = await vi.importActual<typeof FileSystem>('node:fs');
    vi.mocked(writeFileSync).mockImplementationOnce((temporary) => {
      actual.writeFileSync(temporary, '{ partial');
      throw new Error('Disk full');
    });

    expect(writeRolesFile(file, DEFAULT_ROLES)).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(readdirSync(path.dirname(file))).toEqual(['roles.json']);
    expect(readRolesFile(home, root).roles).toEqual([A_ROLE]);
  });

  it('preserves the original and cleans temporary output after replacement fails', () => {
    const { home, root } = directories();
    const file = projectFile(root);
    writeJson(file, { review: { description: A_ROLE.description, entries: [] } });
    const before = readFileSync(file, 'utf8');
    vi.mocked(renameSync).mockImplementationOnce(() => { throw new Error('Replacement refused'); });

    expect(writeRolesFile(file, DEFAULT_ROLES)).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(readdirSync(path.dirname(file))).toEqual(['roles.json']);
    expect(readRolesFile(home, root).roles).toEqual([A_ROLE]);
  });

  it('preserves destination permissions on a successful replacement', () => {
    const { root } = directories();
    const file = projectFile(root);
    writeJson(file, {});
    chmodSync(file, 0o600);

    expect(writeRolesFile(file, [A_ROLE])).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('writes the roles object keyed by name in order, with effort only when stored', () => {
    const { home, root } = directories();
    const file = projectFile(root);
    const roles: Role[] = [
      {
        name: 'planning',
        description: 'Plans.',
        entries: [
          { harness: 'codex', model: 'gpt-6-sol', effort: 'xhigh' },
          { harness: 'claude', model: 'claude-opus-5-5' },
        ],
        commands: ['future command', 'browser goto', 'future command'],
      },
      A_ROLE,
    ];

    expect(writeRolesFile(file, roles)).toBe(true);

    expect(readJson(file)).toEqual({
      planning: {
        description: 'Plans.',
        entries: [{ harness: 'codex', model: 'gpt-6-sol', effort: 'xhigh' }, { harness: 'claude', model: 'claude-opus-5-5' }],
        commands: ['future command', 'browser goto', 'future command'],
      },
      review: { description: 'Second pair of eyes.', entries: [], commands: [] },
    });
    expect(Object.keys(readJson(file).planning)).toEqual(['description', 'entries', 'commands']);
    expect(Object.keys(readJson(file))).toEqual(['planning', 'review']);
    expect(readRolesFile(home, root).roles).toEqual(roles);
  });

  it('reports a write that cannot happen rather than throwing', () => {
    const { root } = directories();
    mkdirSync(projectFile(root), { recursive: true });

    expect(writeRolesFile(projectFile(root), DEFAULT_ROLES)).toBe(false);
    expect(existsSync(projectFile(root))).toBe(true);
  });
});
