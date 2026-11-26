import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as FileSystem from 'node:fs';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { catalogPaths, mutateHostsFile, readHostsFile, serializeHosts, writeHostsFile } from './hosts-file.js';
import type { HostsChange } from './hosts-file.js';
import type { SavedHost } from './hosts-values.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync), renameSync: vi.fn(actual.renameSync) };
});

const roots: string[] = [];

afterEach(() => {
  vi.mocked(writeFileSync).mockClear();
  vi.mocked(renameSync).mockClear();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function directories(): { home: string; root: string } {
  const base = mkdtempSync(path.join(tmpdir(), 'janus-hosts-file-'));
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

function addHost(host: SavedHost): (hosts: SavedHost[]) => HostsChange<string> {
  return (hosts) => ({ ok: true, hosts: [...hosts, host], result: `added ${host.name}` });
}

describe('selecting the effective hosts file', () => {
  it('selects a usable project file over the home file, including an empty object', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { homehost: { destination: 'home.example' } });
    writeJson(projectFile(root), { projecthost: { destination: 'project.example' } });

    const fromProject = readHostsFile(root, home);
    expect(fromProject.hosts).toEqual([{ name: 'projecthost', host: 'project.example' }]);
    expect(fromProject.path).toBe(projectFile(root));
    expect(fromProject.usable).toBe(true);
    expect(fromProject.problems).toEqual([]);

    writeJson(projectFile(root), {});
    const empty = readHostsFile(root, home);
    expect(empty.hosts).toEqual([]);
    expect(empty.path).toBe(projectFile(root));
    expect(empty.usable).toBe(true);
    expect(empty.problems).toEqual([]);
  });

  it('reads the home file when there is no project root', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { homehost: { destination: 'home.example' } });
    writeJson(projectFile(root), { projecthost: { destination: 'project.example' } });

    const read = readHostsFile('', home);
    expect(read.path).toBe(homeFile(home));
    expect(read.hosts).toEqual([{ name: 'homehost', host: 'home.example' }]);
  });

  it('reads the home file when no project file exists', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { homehost: { destination: 'home.example' } });

    const read = readHostsFile(root, home);
    expect(read.path).toBe(homeFile(home));
    expect(read.hosts).toEqual([{ name: 'homehost', host: 'home.example' }]);
    expect(read.problems).toEqual([]);
  });

  it('answers an empty usable catalog at the home write path when neither file exists', () => {
    const { home, root } = directories();

    expect(readHostsFile(root, home)).toEqual({ hosts: [], path: homeFile(home), usable: true, problems: [] });
    expect(existsSync(homeFile(home))).toBe(false);
  });

  it('falls back from an invalid project file to the home file and records the project problem', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { homehost: { destination: 'home.example' } });
    writeJson(projectFile(root), '{ broken');

    const read = readHostsFile(root, home);
    expect(read.hosts).toEqual([{ name: 'homehost', host: 'home.example' }]);
    expect(read.path).toBe(homeFile(home));
    expect(read.usable).toBe(true);
    expect(read.problems).toEqual([{ path: projectFile(root), problem: 'hosts.json is not valid JSON' }]);
  });

  it('falls back when the project config path cannot be read', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { homehost: { destination: 'home.example' } });
    writeFileSync(path.join(root, '.janissary'), 'not a directory');

    const read = readHostsFile(root, home);
    expect(read.hosts).toEqual([{ name: 'homehost', host: 'home.example' }]);
    expect(read.problems).toEqual([{ path: projectFile(root), problem: 'hosts.json could not be read' }]);
  });

  it('treats a directory at the config path as unusable and falls back', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { homehost: { destination: 'home.example' } });
    mkdirSync(projectFile(root), { recursive: true });

    const read = readHostsFile(root, home);
    expect(read.path).toBe(homeFile(home));
    expect(read.problems).toEqual([{ path: projectFile(root), problem: 'hosts.json is a directory' }]);
  });

  it('answers an empty unusable catalog at the home path when the home file is malformed', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), '{ broken');

    expect(readHostsFile(root, home)).toEqual({
      hosts: [],
      path: homeFile(home),
      usable: false,
      problems: [{ path: homeFile(home), problem: 'hosts.json is not valid JSON' }],
    });
  });

  it('answers an empty unusable catalog when the home path is a directory', () => {
    const { home, root } = directories();
    mkdirSync(homeFile(home), { recursive: true });

    const read = readHostsFile(root, home);
    expect(read.usable).toBe(false);
    expect(read.path).toBe(homeFile(home));
    expect(read.problems).toEqual([{ path: homeFile(home), problem: 'hosts.json is a directory' }]);
  });

  it('records both consulted problems when the project and home files are unusable', () => {
    const { home, root } = directories();
    writeJson(projectFile(root), '[]');
    writeJson(homeFile(home), '{ broken');

    const read = readHostsFile(root, home);
    expect(read.usable).toBe(false);
    expect(read.path).toBe(homeFile(home));
    expect(read.problems).toEqual([
      { path: projectFile(root), problem: 'Hosts catalog is not an object' },
      { path: homeFile(home), problem: 'hosts.json is not valid JSON' },
    ]);
  });

  it('keeps the specific validation diagnostic without a trailing period', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { devbox: { user: 'admin' } });

    const read = readHostsFile(root, home);
    expect(read.usable).toBe(false);
    expect(read.problems).toEqual([{ path: homeFile(home), problem: 'Missing destination' }]);
  });
});

describe('shared catalog path definitions', () => {
  it('reports the helper project path when only the project catalog exists', () => {
    const { home, root } = directories();
    writeJson(projectFile(root), { projecthost: { destination: 'project.example' } });

    const catalogs = catalogPaths(root, home);
    expect(catalogs.project).toBe(projectFile(root));
    expect(readHostsFile(root, home).path).toBe(catalogs.project);
  });

  it('reports the helper home path when only the home catalog exists', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { homehost: { destination: 'home.example' } });

    const catalogs = catalogPaths(root, home);
    expect(catalogs.home).toBe(homeFile(home));
    expect(readHostsFile(root, home).path).toBe(catalogs.home);
  });

  it('omits the project path when the root is empty', () => {
    const { home } = directories();

    const catalogs = catalogPaths('', home);
    expect(catalogs.project).toBeUndefined();
    expect(catalogs.home).toBe(homeFile(home));
  });
});

describe('reporting unusable files', () => {
  it('reports a problem once, when it changes, and when it returns after recovery', () => {
    const { home, root } = directories();
    const notify = vi.fn();
    writeJson(homeFile(home), '{ broken');

    readHostsFile(root, home, notify);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenLastCalledWith(`Hosts file ${homeFile(home)} is unusable: hosts.json is not valid JSON.`);
    readHostsFile(root, home, notify);
    expect(notify).toHaveBeenCalledTimes(1);

    writeJson(homeFile(home), '[]');
    readHostsFile(root, home, notify);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenLastCalledWith(`Hosts file ${homeFile(home)} is unusable: Hosts catalog is not an object.`);

    writeJson(homeFile(home), {});
    readHostsFile(root, home, notify);
    expect(notify).toHaveBeenCalledTimes(2);

    writeJson(homeFile(home), '{ broken');
    readHostsFile(root, home, notify);
    expect(notify).toHaveBeenCalledTimes(3);
    expect(notify).toHaveBeenLastCalledWith(`Hosts file ${homeFile(home)} is unusable: hosts.json is not valid JSON.`);
  });

  it('reports both consulted problems and retains the memo of an unconsulted home file', () => {
    const { home, root } = directories();
    const notify = vi.fn();
    writeJson(homeFile(home), '{ broken');

    readHostsFile(root, home, notify);
    expect(notify).toHaveBeenCalledTimes(1);

    writeJson(projectFile(root), { devbox: { destination: 'project.example' } });
    readHostsFile(root, home, notify);
    expect(notify).toHaveBeenCalledTimes(1);

    writeJson(projectFile(root), '{ broken');
    readHostsFile(root, home, notify);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenLastCalledWith(`Hosts file ${projectFile(root)} is unusable: hosts.json is not valid JSON.`);

    writeJson(homeFile(home), {});
    readHostsFile(root, home, notify);
    expect(notify).toHaveBeenCalledTimes(2);

    writeJson(homeFile(home), '{ broken');
    readHostsFile(root, home, notify);
    expect(notify).toHaveBeenCalledTimes(3);
    expect(notify).toHaveBeenLastCalledWith(`Hosts file ${homeFile(home)} is unusable: hosts.json is not valid JSON.`);
  });

  it('clears a reported problem when the consulted file goes missing', () => {
    const { home, root } = directories();
    const notify = vi.fn();
    writeJson(homeFile(home), '{ broken');

    readHostsFile(root, home, notify);
    expect(notify).toHaveBeenCalledTimes(1);

    rmSync(homeFile(home));
    expect(readHostsFile(root, home, notify).usable).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);

    writeJson(homeFile(home), '{ broken');
    readHostsFile(root, home, notify);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('leaves the memo untouched when no callback is supplied', () => {
    const { home, root } = directories();
    const notify = vi.fn();
    writeJson(homeFile(home), '{ broken');

    readHostsFile(root, home);
    readHostsFile(root, home, notify);
    expect(notify).toHaveBeenCalledTimes(1);

    writeJson(homeFile(home), {});
    readHostsFile(root, home);
    writeJson(homeFile(home), '{ broken');
    readHostsFile(root, home, notify);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe('serializing hosts', () => {
  it('serializes an empty catalog as an empty object', () => {
    expect(serializeHosts([])).toBe('{}');
  });

  it('formats entries with the destination formatter and optional fields', () => {
    expect(serializeHosts([
      { name: 'DevBox', host: 'box.example', user: 'admin', port: 2222, path: '~/proj' },
      { name: 'gateway', host: '10.0.0.1' },
    ])).toBe([
      '{',
      '  "DevBox": {',
      '    "user": "admin",',
      '    "destination": "box.example:2222",',
      '    "path": "~/proj"',
      '  },',
      '  "gateway": {',
      '    "destination": "10.0.0.1"',
      '  }',
      '}',
    ].join('\n'));
  });

  it('round trips numeric and special keys in folded-name order', () => {
    const { home, root } = directories();
    const file = projectFile(root);
    const names = ['10', 'zulu', '__proto__', '2', '11', '1', 'Alpha'];
    const hosts = names.map((name): SavedHost => ({ name, host: `${name}.example` }));

    expect(writeHostsFile(file, hosts)).toBe(true);
    const text = readFileSync(file, 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    const folded = (name: string) => name.toLowerCase();
    const sortedNames = names.toSorted((left, right) => (
      folded(left) < folded(right) ? -1 : folded(left) > folded(right) ? 1 : 0
    ));
    const positions = sortedNames.map((name) => text.indexOf(`${JSON.stringify(name)}:`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual(positions.toSorted((left, right) => left - right));
    expect(Object.hasOwn(JSON.parse(text) as unknown, '__proto__')).toBe(true);
    expect(readHostsFile(root, home).hosts.map((host) => host.name)).toEqual([
      '1', '10', '11', '2', '__proto__', 'Alpha', 'zulu',
    ]);
  });
});

describe('writing and mutating the effective catalog', () => {
  it('creates parent directories and appends one trailing newline', () => {
    const { root } = directories();
    const file = projectFile(root);
    expect(existsSync(file)).toBe(false);

    expect(writeHostsFile(file, [])).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('{}\n');
  });

  it('creates a missing home file on the first successful mutation', () => {
    const { home, root } = directories();
    expect(existsSync(homeFile(home))).toBe(false);

    expect(mutateHostsFile(root, home, undefined, addHost({ name: 'first', host: 'first.example' })).ok).toBe(true);
    expect(existsSync(homeFile(home))).toBe(true);
    expect(readHostsFile(root, home).hosts).toEqual([{ name: 'first', host: 'first.example' }]);
  });

  it('re-reads a hand edit before applying a change', () => {
    const { home, root } = directories();
    writeJson(projectFile(root), { first: { destination: 'first.example' } });
    writeJson(projectFile(root), {
      first: { destination: 'first.example' },
      handmade: { destination: 'hand.example' },
    });

    const result = mutateHostsFile(root, home, undefined, addHost({ name: 'second', host: 'second.example' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path).toBe(projectFile(root));
    expect(result.hosts.map((host) => host.name)).toEqual(['first', 'handmade', 'second']);
    expect(result.result).toBe('added second');
    expect(readHostsFile(root, home).hosts.map((host) => host.name)).toEqual(['first', 'handmade', 'second']);
  });

  it('returns the selected path and written catalog on success', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { homehost: { destination: 'home.example' } });

    const result = mutateHostsFile(root, home, undefined, addHost({ name: 'added', host: 'added.example' }));
    expect(result).toMatchObject({ ok: true, path: homeFile(home), result: 'added added' });
    expect(readFileSync(homeFile(home), 'utf8')).toBe([
      '{',
      '  "added": {',
      '    "destination": "added.example"',
      '  },',
      '  "homehost": {',
      '    "destination": "home.example"',
      '  }',
      '}',
      '',
    ].join('\n'));
  });

  it('returns a caller refusal without writing', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { devbox: { destination: 'dev.example' } });
    const before = readFileSync(homeFile(home), 'utf8');

    const result = mutateHostsFile(root, home, undefined, () => ({ ok: false, error: 'Host "other" already exists.' }));
    expect(result).toEqual({ ok: false, error: 'Host "other" already exists.' });
    expect(readFileSync(homeFile(home), 'utf8')).toBe(before);
  });

  it('refuses an unusable effective file', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), '{ broken');

    const result = mutateHostsFile(root, home, undefined, addHost({ name: 'new', host: 'new.example' }));
    expect(result).toEqual({ ok: false, error: `Cannot save hosts: ${homeFile(home)} is unusable — fix it by hand.` });
    expect(readFileSync(homeFile(home), 'utf8')).toBe('{ broken');
  });

  it('reports fresh problems through the callback during a mutation', () => {
    const { home, root } = directories();
    const notify = vi.fn();
    writeJson(projectFile(root), '{ broken');
    writeJson(homeFile(home), { devbox: { destination: 'dev.example' } });

    const result = mutateHostsFile(root, home, notify, addHost({ name: 'new', host: 'new.example' }));
    expect(result.ok).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(`Hosts file ${projectFile(root)} is unusable: hosts.json is not valid JSON.`);
    expect(readFileSync(projectFile(root), 'utf8')).toBe('{ broken');
  });

  it('returns a write failure without a replacement catalog and preserves the prior bytes', async () => {
    const { home, root } = directories();
    const file = homeFile(home);
    writeJson(file, { devbox: { destination: 'dev.example' } });
    const before = readFileSync(file, 'utf8');
    const actual = await vi.importActual<typeof FileSystem>('node:fs');
    vi.mocked(writeFileSync).mockImplementationOnce((temporary) => {
      actual.writeFileSync(temporary, '{ partial');
      throw new Error('Disk full');
    });

    const result = mutateHostsFile(root, home, undefined, addHost({ name: 'new', host: 'new.example' }));
    expect(result).toEqual({ ok: false, error: `Could not write hosts.json at ${file}.` });
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(readdirSync(path.dirname(file))).toEqual(['hosts.json']);
  });

  it('leaves an invalid project override untouched while writing through the home fallback', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { homehost: { destination: 'home.example' } });
    writeJson(projectFile(root), {});
    expect(readHostsFile(root, home).hosts).toEqual([]);

    writeJson(projectFile(root), '{ broken');
    const broken = readFileSync(projectFile(root), 'utf8');
    const read = readHostsFile(root, home);
    expect(read.hosts).toEqual([{ name: 'homehost', host: 'home.example' }]);
    expect(read.path).toBe(homeFile(home));

    const result = mutateHostsFile(root, home, undefined, addHost({ name: 'added', host: 'added.example' }));
    expect(result.ok).toBe(true);
    expect(readFileSync(projectFile(root), 'utf8')).toBe(broken);
    expect(readHostsFile(root, home).hosts.map((host) => host.name)).toEqual(['added', 'homehost']);
  });
});
