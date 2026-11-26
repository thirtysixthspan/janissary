import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as FileSystem from 'node:fs';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readHostsFile } from './hosts-file.js';
import { importSshHosts } from './import-ssh.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    writeFileSync: vi.fn(actual.writeFileSync),
  };
});

const DISPLAY = '~/.ssh/config';
const roots: string[] = [];

function directories(): { home: string; root: string } {
  const base = mkdtempSync(path.join(tmpdir(), 'janus-import-ssh-'));
  roots.push(base);
  const home = path.join(base, 'home');
  const root = path.join(base, 'project');
  mkdirSync(home, { recursive: true });
  mkdirSync(root, { recursive: true });
  return { home, root };
}

const homeFile = (home: string) => path.join(home, '.janissary', 'hosts.json');

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, typeof value === 'string' ? value : JSON.stringify(value, undefined, 2));
}

function sourceConfig(root: string, text: string): string {
  const source = path.join(root, 'ssh_config');
  writeFileSync(source, text);
  return source;
}

afterEach(async () => {
  const actual = await vi.importActual<typeof FileSystem>('node:fs');
  vi.mocked(readFileSync).mockReset().mockImplementation(actual.readFileSync);
  vi.mocked(writeFileSync).mockReset().mockImplementation(actual.writeFileSync);
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('importSshHosts', () => {
  it('adds the importable aliases in one write and leaves a clashing saved host unchanged', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { web2: { destination: 'old.example' } });
    const source = sourceConfig(root, [
      'Host bad', '  User a@b',
      'Host web1 web2', '  HostName %h.corp.example', '  Port 2222',
      'Host db*', '  User dba',
      'Host *', '  User ops',
    ].join('\n'));
    vi.mocked(writeFileSync).mockClear();

    const result = importSshHosts(root, home, source, DISPLAY);

    expect(result).toEqual({
      ok: true,
      hosts: [
        { name: 'web1', host: 'web1.corp.example', user: 'ops', port: 2222 },
        { name: 'web2', host: 'old.example' },
      ],
      imported: 1,
      skipped: 2,
      summary: 'Imported 1 host from ~/.ssh/config; skipped 2.',
    });
    expect(readHostsFile(root, home).hosts).toEqual([
      { name: 'web1', host: 'web1.corp.example', user: 'ops', port: 2222 },
      { name: 'web2', host: 'old.example' },
    ]);
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledTimes(1);
  });

  it('uses the alias name as destination when no HostName applies', () => {
    const { home, root } = directories();
    const source = sourceConfig(root, 'Host box\n  User ops\n');

    expect(importSshHosts(root, home, source, DISPLAY)).toEqual({
      ok: true,
      hosts: [{ name: 'box', host: 'box', user: 'ops' }],
      imported: 1,
      skipped: 0,
      summary: 'Imported 1 host from ~/.ssh/config.',
    });
  });

  it('imports only HostName, User, and Port', () => {
    const { home, root } = directories();
    const source = sourceConfig(root, [
      'Host jumpy', '  HostName jumpy.example', '  User ops', '  Port 2202',
      '  IdentityFile ~/.ssh/id_ed25519', '  ProxyJump bastion.example',
    ].join('\n'));

    expect(importSshHosts(root, home, source, DISPLAY).ok).toBe(true);
    expect(JSON.parse(readFileSync(homeFile(home), 'utf8'))).toEqual({
      jumpy: { user: 'ops', destination: 'jumpy.example:2202' },
    });
  });

  it('skips clashing, invalid, and token-invalid aliases and preserves the rest', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { web2: { destination: 'old.example' } });
    const source = sourceConfig(root, [
      'Host badname@', '  HostName ok.example',
      'Host userbad', '  User a@b', '  HostName ok.example',
      'Host hostbad', '  HostName bad@host',
      'Host portbad', '  HostName ok.example', '  Port abc',
      'Host web2', '  HostName new.example',
      'Host token', '  HostName %n.example',
      'Host good', '  HostName good.example', '  User ops', '  Port 22',
    ].join('\n'));

    const result = importSshHosts(root, home, source, DISPLAY);

    expect(result).toEqual({
      ok: true,
      hosts: [
        { name: 'good', host: 'good.example', user: 'ops', port: 22 },
        { name: 'web2', host: 'old.example' },
      ],
      imported: 1,
      skipped: 6,
      summary: 'Imported 1 host from ~/.ssh/config; skipped 6.',
    });
  });

  it('reports a source read failure without consulting or writing the catalog', async () => {
    const { home, root } = directories();
    writeJson(homeFile(home), '{ broken');
    const source = sourceConfig(root, 'Host only\n  HostName only.example\n');
    const actual = await vi.importActual<typeof FileSystem>('node:fs');
    vi.mocked(readFileSync).mockImplementationOnce((file) => {
      if (file === source) throw Object.assign(new Error('forced read failure'), { code: 'ENOENT' });
      return actual.readFileSync(file);
    });
    vi.mocked(writeFileSync).mockClear();

    expect(importSshHosts(root, home, source, DISPLAY)).toEqual({
      ok: false,
      error: 'Cannot read ssh config ~/.ssh/config: no such file.',
    });
    expect(readFileSync(homeFile(home), 'utf8')).toBe('{ broken');
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it('reports an unusable catalog verbatim without writing', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), '{ broken');
    const source = sourceConfig(root, 'Host only\n  HostName only.example\n');
    vi.mocked(writeFileSync).mockClear();

    expect(importSshHosts(root, home, source, DISPLAY)).toEqual({
      ok: false,
      error: `Cannot save hosts: ${homeFile(home)} is unusable — fix it by hand.`,
    });
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it('reports a failed catalog write verbatim and preserves the prior bytes', async () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { devbox: { destination: 'dev.example' } });
    const file = homeFile(home);
    const before = readFileSync(file, 'utf8');
    const source = sourceConfig(root, 'Host only\n  HostName only.example\n');
    const actual = await vi.importActual<typeof FileSystem>('node:fs');
    vi.mocked(writeFileSync).mockClear();
    vi.mocked(writeFileSync).mockImplementationOnce((temporary) => {
      actual.writeFileSync(temporary, '{ partial');
      throw new Error('Disk full');
    });

    expect(importSshHosts(root, home, source, DISPLAY)).toEqual({
      ok: false,
      error: `Could not write hosts.json at ${file}.`,
    });
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('reports several hosts in the plural with the skipped clause', () => {
    const { home, root } = directories();
    writeJson(homeFile(home), { skipme: { destination: 'old.example' } });
    const source = sourceConfig(root, [
      'Host one', '  HostName one.example',
      'Host two', '  HostName two.example',
      'Host three', '  HostName three.example',
      'Host skipme', '  HostName new.example',
      'Host bad', '  User a@b',
    ].join('\n'));

    expect(importSshHosts(root, home, source, DISPLAY)).toMatchObject({
      ok: true,
      imported: 3,
      skipped: 2,
      summary: 'Imported 3 hosts from ~/.ssh/config; skipped 2.',
    });
  });

  it('reports nothing importable with and without skipped aliases and writes nothing', () => {
    const { home, root } = directories();
    const emptySource = sourceConfig(root, '');
    vi.mocked(writeFileSync).mockClear();

    expect(importSshHosts(root, home, emptySource, DISPLAY)).toEqual({
      ok: true,
      hosts: [],
      imported: 0,
      skipped: 0,
      summary: 'No aliases to import from ~/.ssh/config.',
    });
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
    expect(existsSync(homeFile(home))).toBe(false);

    const skippedSource = sourceConfig(root, 'Host baduser\n  User a@b\nHost badport\n  Port abc\n');
    vi.mocked(writeFileSync).mockClear();

    expect(importSshHosts(root, home, skippedSource, DISPLAY)).toEqual({
      ok: true,
      hosts: [],
      imported: 0,
      skipped: 2,
      summary: 'No aliases to import from ~/.ssh/config; skipped 2.',
    });
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
    expect(existsSync(homeFile(home))).toBe(false);
  });
});
