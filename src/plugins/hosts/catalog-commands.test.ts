import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as FileSystem from 'node:fs';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseCatalogCommand, runCatalogCommand } from './catalog-commands.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync), renameSync: vi.fn(actual.renameSync) };
});

const USAGE = 'Usage: hosts [list|add|remove].';
const ADD_USAGE = 'Usage: hosts add <name> <[user@]host[:port]> [path]';
const REMOVE_USAGE = 'Usage: hosts remove <name>';

const roots: string[] = [];

afterEach(() => {
  vi.mocked(writeFileSync).mockClear();
  vi.mocked(renameSync).mockClear();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function directories(): { home: string; root: string } {
  const base = mkdtempSync(path.join(tmpdir(), 'janus-hosts-command-'));
  roots.push(base);
  const home = path.join(base, 'home');
  const root = path.join(base, 'project');
  mkdirSync(home, { recursive: true });
  mkdirSync(root, { recursive: true });
  return { home, root };
}

const homeFile = (home: string) => path.join(home, '.janissary', 'hosts.json');
const projectFile = (root: string) => path.join(root, '.janissary', 'hosts.json');

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, typeof value === 'string' ? value : JSON.stringify(value, undefined, 2));
}

describe('parseCatalogCommand', () => {
  it('opens on empty and whitespace-only tails', () => {
    for (const argument of ['', ' '.repeat(3), '\t\n ']) {
      expect(parseCatalogCommand(argument)).toEqual({ kind: 'open' });
    }
  });

  it('matches verbs without regard to case', () => {
    expect(parseCatalogCommand('LIST')).toEqual({ kind: 'list' });
    expect(parseCatalogCommand('Add Lab lab.local')).toEqual({
      kind: 'add', host: { name: 'Lab', host: 'lab.local' },
    });
    expect(parseCatalogCommand('REMOVE Lab')).toEqual({ kind: 'remove', name: 'Lab' });
  });

  it('refuses unknown verbs and list operands', () => {
    expect(parseCatalogCommand('show')).toEqual({ kind: 'refusal', reason: USAGE });
    expect(parseCatalogCommand('list extra')).toEqual({ kind: 'refusal', reason: USAGE });
  });

  it('refuses malformed add and remove arity', () => {
    for (const argument of ['add', 'add name', 'add name host extra path', 'remove', 'remove a b']) {
      const expected = argument.startsWith('remove') ? REMOVE_USAGE : ADD_USAGE;
      expect(parseCatalogCommand(argument)).toEqual({ kind: 'refusal', reason: expected });
    }
  });

  it('refuses a bare @, an empty user, and multiple user separators', () => {
    for (const argument of ['add name @', 'add name @host', 'add name a@b@c', 'add name a@@host']) {
      expect(parseCatalogCommand(argument)).toEqual({ kind: 'refusal', reason: ADD_USAGE });
    }
  });

  it('passes a user with an empty host to the field validator', () => {
    expect(parseCatalogCommand('add name ops@')).toEqual({
      kind: 'refusal', reason: 'Invalid host "". Use letters, digits, and . - _ only.',
    });
  });

  it('reports the exact shared diagnostic for each invalid field', () => {
    const cases: Array<[string, string]> = [
      ['add bad!name host', 'Invalid name "bad!name". Use letters, digits, and . - _ only.'],
      ['add name bad!user@host', 'Invalid user "bad!user". Use letters, digits, and . - _ only.'],
      ['add name bad!host', 'Invalid host "bad!host". Use letters, digits, and . - _ only.'],
      ['add name host:abc', 'Invalid port "abc". Use digits only, from 1 to 65535.'],
      ['add name host bad!path', 'Invalid path "bad!path". Use letters, digits, and . - _ / ~ only.'],
      ['remove bad!name', 'Invalid name "bad!name". Use letters, digits, and . - _ only.'],
    ];
    for (const [argument, reason] of cases) {
      expect(parseCatalogCommand(argument)).toEqual({ kind: 'refusal', reason });
    }
  });

  it('parses a minimal and a full add into a validated host', () => {
    expect(parseCatalogCommand('add name host')).toEqual({
      kind: 'add', host: { name: 'name', host: 'host' },
    });
    expect(parseCatalogCommand('add Lab ops@lab.local:2222 ~/work')).toEqual({
      kind: 'add',
      host: { name: 'Lab', host: 'lab.local', user: 'ops', port: 2222, path: '~/work' },
    });
  });
});

describe('runCatalogCommand', () => {
  it('opens on an empty tail without touching storage', () => {
    const { home, root } = directories();
    expect(runCatalogCommand('', root, home)).toEqual({ kind: 'open' });
    expect(existsSync(homeFile(home))).toBe(false);
  });

  it('returns exact two-space JSON for a list', () => {
    const { home, root } = directories();
    writeJson(projectFile(root), { Lab: { user: 'ops', destination: 'lab.local:2222', path: '~/work' } });

    expect(runCatalogCommand('list', root, home)).toEqual({
      kind: 'output',
      text: [
        '{',
        '  "Lab": {',
        '    "user": "ops",',
        '    "destination": "lab.local:2222",',
        '    "path": "~/work"',
        '  }',
        '}',
      ].join('\n'),
    });
  });

  it('lists an empty object for empty and unusable effective files', () => {
    const empty = directories();
    expect(runCatalogCommand('list', empty.root, empty.home)).toEqual({ kind: 'output', text: '{}' });

    const broken = directories();
    writeJson(homeFile(broken.home), '{ broken');
    expect(runCatalogCommand('list', broken.root, broken.home)).toEqual({ kind: 'output', text: '{}' });
  });

  it('adds a minimal host and returns only a successful write with a catalog and path', () => {
    const { home, root } = directories();
    const result = runCatalogCommand('add Lab lab.local', root, home);

    expect(result).toEqual({
      kind: 'mutation',
      text: 'Host Lab added.',
      hosts: [{ name: 'Lab', host: 'lab.local' }],
      path: homeFile(home),
    });
    expect(readFileSync(homeFile(home), 'utf8')).toBe('{\n  "Lab": {\n    "destination": "lab.local"\n  }\n}\n');
  });

  it('adds a full host through the shared validator and formatter', () => {
    const { home, root } = directories();
    const result = runCatalogCommand('add Lab ops@lab.local:2222 ~/work', root, home);

    expect(result).toMatchObject({ kind: 'mutation', text: 'Host Lab added.' });
    expect(readFileSync(homeFile(home), 'utf8')).toBe([
      '{',
      '  "Lab": {',
      '    "user": "ops",',
      '    "destination": "lab.local:2222",',
      '    "path": "~/work"',
      '  }',
      '}',
      '',
    ].join('\n'));
  });

  it('replaces only a case-folded match under the newly supplied spelling', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), {
      Lab: { user: 'ops', destination: 'lab.local:2222', path: '~/work' },
      other: { destination: 'other.example' },
    });

    const result = runCatalogCommand('add lab lab.local', root, home);
    expect(result).toMatchObject({
      kind: 'mutation',
      text: 'Host lab updated.',
      hosts: [{ name: 'lab', host: 'lab.local' }, { name: 'other', host: 'other.example' }],
    });
  });

  it('removes a host with the stored spelling and reports a miss with the requested spelling', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { Lab: { destination: 'lab.local' }, other: { destination: 'other.example' } });

    const removed = runCatalogCommand('remove LAB', root, home);
    expect(removed).toMatchObject({
      kind: 'mutation',
      text: 'Host Lab removed.',
      hosts: [{ name: 'other', host: 'other.example' }],
    });

    const before = readFileSync(homeFile(home), 'utf8');
    expect(runCatalogCommand('remove LAB', root, home)).toEqual({
      kind: 'refusal', reason: 'No host named "LAB".',
    });
    expect(readFileSync(homeFile(home), 'utf8')).toBe(before);
  });

  it('refuses an unusable effective file without rewording the storage failure', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), '{ broken');

    expect(runCatalogCommand('add new new.example', root, home)).toEqual({
      kind: 'refusal',
      reason: `Cannot save hosts: ${homeFile(home)} is unusable — fix it by hand.`,
    });
  });

  it('refuses a write failure without returning a catalog or path', async () => {
    const { home, root } = directories();
    const file = homeFile(home);
    writeJson(file, { devbox: { destination: 'dev.example' } });
    const before = readFileSync(file, 'utf8');
    const actual = await vi.importActual<typeof FileSystem>('node:fs');
    vi.mocked(writeFileSync).mockImplementationOnce((temporary) => {
      actual.writeFileSync(temporary, '{ partial');
      throw new Error('Disk full');
    });

    expect(runCatalogCommand('add new new.example', root, home)).toEqual({
      kind: 'refusal', reason: `Could not write hosts.json at ${file}.`,
    });
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('preserves a hand edit made between the parse and the mutation', () => {
    const { home, root } = directories();
    writeJson(projectFile(root), { first: { destination: 'first.example' } });
    writeJson(projectFile(root), {
      first: { destination: 'first.example' },
      handmade: { destination: 'hand.example' },
    });

    const result = runCatalogCommand('add second second.example', root, home);
    expect(result).toMatchObject({ kind: 'mutation', path: projectFile(root) });
    expect(result.kind === 'mutation' && result.hosts.map((host) => host.name))
      .toEqual(['first', 'handmade', 'second']);
  });

  it('skips storage for malformed requests', () => {
    const { home, root } = directories();
    for (const argument of ['show', 'list extra', 'add', 'add name', 'add name @', 'remove a b', 'remove bad!name']) {
      expect(runCatalogCommand(argument, root, home).kind).toBe('refusal');
    }
    expect(existsSync(homeFile(home))).toBe(false);
    expect(existsSync(projectFile(root))).toBe(false);
  });

  it('exercises add, list, replace and remove as one scratch workflow', () => {
    const { home, root } = directories();

    expect(runCatalogCommand('add Lab ops@lab.local:2222 ~/work', root, home)).toMatchObject({
      kind: 'mutation', text: 'Host Lab added.',
    });
    expect(runCatalogCommand('list', root, home)).toEqual({
      kind: 'output',
      text: [
        '{',
        '  "Lab": {',
        '    "user": "ops",',
        '    "destination": "lab.local:2222",',
        '    "path": "~/work"',
        '  }',
        '}',
      ].join('\n'),
    });
    expect(runCatalogCommand('add lab lab.local', root, home)).toMatchObject({
      kind: 'mutation', text: 'Host lab updated.',
    });
    expect(runCatalogCommand('remove LAB', root, home)).toMatchObject({
      kind: 'mutation', text: 'Host lab removed.',
    });
    expect(runCatalogCommand('list', root, home)).toEqual({ kind: 'output', text: '{}' });
  });

  it('passes the notification callback into storage', () => {
    const { home, root } = directories();
    const notify = vi.fn();
    writeJson(projectFile(root), '{ broken');
    writeJson(homeFile(home), { devbox: { destination: 'dev.example' } });

    expect(runCatalogCommand('add new new.example', root, home, notify)).toMatchObject({ kind: 'mutation' });
    expect(notify).toHaveBeenCalledWith(`Hosts file ${projectFile(root)} is unusable: hosts.json is not valid JSON.`);
  });
});
