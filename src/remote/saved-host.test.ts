import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import type { SavedHost } from '../plugins/hosts/hosts-values.js';
import { parseRemoteAddress } from './address.js';
import { resolveRemoteLaunchAddress, resolveSavedHost } from './saved-host.js';

vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));

const roots: string[] = [];
const previousHome = process.env.HOME;

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  vi.clearAllMocks();
});

function directories(): { home: string; root: string } {
  const base = mkdtempSync(path.join(tmpdir(), 'janus-saved-host-'));
  roots.push(base);
  const home = path.join(base, 'home');
  const root = path.join(base, 'project');
  mkdirSync(home, { recursive: true });
  mkdirSync(root, { recursive: true });
  return { home, root };
}

function writeHosts(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, typeof value === 'string' ? value : JSON.stringify(value));
}

function managersFor(root: string): Managers {
  return { tab: { launchDir: root } } as unknown as Managers;
}

function launch(managers: Managers, token: string) {
  const parsed = parseRemoteAddress(token);
  if ('error' in parsed) throw new Error(parsed.error);
  return resolveRemoteLaunchAddress(managers, 'janus', parsed);
}

describe('resolveSavedHost', () => {
  const catalog: SavedHost[] = [
    { name: 'Lab', host: 'devbox', user: 'admin', port: 2222, path: '/srv/proj' },
    { name: 'plain', host: 'buildbox' },
  ];

  it('matches a bare name exactly, case-folded, and records the stored name', () => {
    expect(resolveSavedHost('lab', catalog)).toMatchObject({
      host: 'devbox', hostName: 'Lab', port: 2222, path: '/srv/proj',
    });
    expect(resolveSavedHost('LAB', catalog)).toEqual(resolveSavedHost('lab', catalog));
    expect(resolveSavedHost('pla', catalog)).toBeUndefined();
  });

  it('leaves a qualified literal to the address grammar', () => {
    expect(resolveSavedHost('admin@lab', catalog)).toBeUndefined();
    expect(resolveSavedHost('lab:/srv/proj', catalog)).toBeUndefined();
  });

  it('resolves the SSH user, port, and path of a saved endpoint', () => {
    expect(resolveSavedHost('lab', catalog)).toEqual({
      address: 'admin@devbox:/srv/proj', destination: 'admin@devbox', host: 'devbox',
      path: '/srv/proj', port: 2222, hostName: 'Lab',
    });
  });

  it('keeps workspace discovery from the login directory when the saved host has no path', () => {
    expect(resolveSavedHost('plain', catalog)).toEqual({
      address: 'buildbox', destination: 'buildbox', host: 'buildbox', hostName: 'plain',
    });
  });
});

describe('resolveRemoteLaunchAddress', () => {
  it('returns a qualified literal untouched without consulting the catalog', () => {
    const { root } = directories();
    const parsed = parseRemoteAddress('admin@devbox:/srv/proj');
    if ('error' in parsed) throw new Error(parsed.error);

    expect(resolveRemoteLaunchAddress(managersFor(root), 'janus', parsed)).toBe(parsed);
    expect(notify).not.toHaveBeenCalled();
  });

  it('resolves a bare name from the effective project catalog', () => {
    const { home, root } = directories();
    process.env.HOME = home;
    writeHosts(path.join(root, '.janissary', 'hosts.json'), {
      lab: { user: 'admin', destination: 'devbox:2222', path: '/srv/proj' },
    });

    expect(launch(managersFor(root), 'lab')).toEqual({
      address: 'admin@devbox:/srv/proj', destination: 'admin@devbox', host: 'devbox',
      path: '/srv/proj', port: 2222, hostName: 'lab',
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('falls back to the home catalog, reporting a malformed project override', () => {
    const { home, root } = directories();
    process.env.HOME = home;
    writeHosts(path.join(home, '.janissary', 'hosts.json'), { lab: { destination: 'homebox:2200' } });
    writeHosts(path.join(root, '.janissary', 'hosts.json'), '{ broken');

    expect(launch(managersFor(root), 'lab')).toMatchObject({
      address: 'homebox', destination: 'homebox', host: 'homebox', port: 2200, hostName: 'lab',
    });
    expect(notify).toHaveBeenCalledWith(
      expect.anything(), 'manual', 'janus',
      `Hosts file ${path.join(root, '.janissary', 'hosts.json')} is unusable: hosts.json is not valid JSON.`,
    );
  });

  it('keeps the parsed address when no saved name matches', () => {
    const { home, root } = directories();
    process.env.HOME = home;
    writeHosts(path.join(home, '.janissary', 'hosts.json'), { other: { destination: 'somewhere' } });

    expect(launch(managersFor(root), 'lab')).toEqual({
      address: 'lab', destination: 'lab', host: 'lab', path: undefined,
    });
  });

  it('keeps the parsed address and reports an unusable catalog only once', () => {
    const { home, root } = directories();
    process.env.HOME = home;
    const file = path.join(home, '.janissary', 'hosts.json');
    writeHosts(file, '{ broken');
    const managers = managersFor(root);

    expect(launch(managers, 'lab')).toEqual({
      address: 'lab', destination: 'lab', host: 'lab', path: undefined,
    });
    expect(launch(managers, 'lab')).toEqual({
      address: 'lab', destination: 'lab', host: 'lab', path: undefined,
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      managers, 'manual', 'janus', `Hosts file ${file} is unusable: hosts.json is not valid JSON.`,
    );
  });
});
