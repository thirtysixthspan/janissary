import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import type { RemoteAddress } from '../remote/address.js';
import { resolveRemoteAgentTarget } from './remote-target.js';

vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));

// Which live session an agent run on `user@devbox` rides instead of opening its own: one on the same
// destination whose channel is attached, whose workspace has landed, and which has not ended. Anything
// else gets a fresh channel of its own.

type FakeEntry = {
  labels: Set<string>;
  address: { destination: string; host: string; port?: number };
  channel: { attached: boolean };
  workspaceDir?: string;
  closed: boolean;
};

function liveEntry(overrides: Partial<FakeEntry> = {}): FakeEntry {
  return {
    labels: new Set(['h1']),
    address: { destination: 'user@devbox', host: 'devbox' },
    channel: { attached: true },
    workspaceDir: '/srv/ws',
    closed: false,
    ...overrides,
  };
}

function managersWith(entries: FakeEntry | FakeEntry[], launchDir = '') {
  const list = Array.isArray(entries) ? entries : [entries];
  const fresh = { attached: true };
  const byLabel = (label: string) => list.find((entry) => entry.labels.has(label));
  const create = vi.fn((_label: string, _address: RemoteAddress, _cwd: string) => fresh);
  const remote = {
    liveEntries: () => list,
    addressOf: (label: string) => byLabel(label)?.address,
    get: (label: string) => byLabel(label)?.channel,
    workspaceOf: (label: string) => byLabel(label)?.workspaceDir,
    acquireAgentLease: vi.fn(() => async () => {}),
    create,
    readyOf: vi.fn(() => Promise.resolve('/srv/fresh')),
    release: vi.fn(),
  };
  return { managers: { remote, tab: { launchDir } } as unknown as Managers, remote, fresh };
}

const roots: string[] = [];
const previousHome = process.env.HOME;

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  vi.clearAllMocks();
});

function project(): { home: string; root: string } {
  const base = mkdtempSync(path.join(tmpdir(), 'janus-agent-target-'));
  roots.push(base);
  const home = path.join(base, 'home');
  const root = path.join(base, 'project');
  mkdirSync(home, { recursive: true });
  mkdirSync(root, { recursive: true });
  process.env.HOME = home;
  return { home, root };
}

function writeCatalog(root: string, value: unknown): string {
  const file = path.join(root, '.janissary', 'hosts.json');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
}

const resolve = (managers: Managers, selector = 'USER@devbox', sourceLabel = 'shell') =>
  resolveRemoteAgentTarget(managers, selector, sourceLabel, '/project', new AbortController().signal);

describe('resolveRemoteAgentTarget reuse of a live session', () => {
  it('rides an attached session with a workspace on the same destination, ignoring case', async () => {
    const { managers, remote } = managersWith(liveEntry());
    const target = await resolve(managers);
    expect(remote.create).not.toHaveBeenCalled();
    expect(target.workspace).toBe('/srv/ws');
    expect(remote.acquireAgentLease).toHaveBeenCalledWith('h1', expect.stringMatching(/^agent:/));
  });

  it.each([
    { state: 'detached', entry: liveEntry({ channel: { attached: false } }) },
    { state: 'without a workspace yet', entry: liveEntry({ workspaceDir: undefined }) },
    { state: 'on another destination', entry: liveEntry({ address: { destination: 'user@other', host: 'other' } }) },
    { state: 'already ended', entry: liveEntry({ closed: true }) },
  ])('opens its own channel instead of riding a session $state', async ({ entry }) => {
    const { managers, remote } = managersWith(entry);
    const target = await resolve(managers);
    expect(remote.create).toHaveBeenCalledTimes(1);
    expect(target.workspace).toBe('/srv/fresh');
  });

  it('prefers the source channel when both it and another entry match', async () => {
    const source = liveEntry({ labels: new Set(['shell']), workspaceDir: '/srv/source' });
    const other = liveEntry({ labels: new Set(['h2']), workspaceDir: '/srv/other' });
    const { managers, remote } = managersWith([source, other]);
    const target = await resolve(managers, 'USER@devbox', 'shell');
    expect(remote.create).not.toHaveBeenCalled();
    expect(target.workspace).toBe('/srv/source');
    expect(remote.acquireAgentLease).toHaveBeenCalledWith('shell', expect.stringMatching(/^agent:/));
  });
});

describe('resolveRemoteAgentTarget saved-name resolution', () => {
  it('rejects an invalid selector before consulting any catalog', async () => {
    const { managers, remote } = managersWith(liveEntry());
    await expect(resolve(managers, 'bad host')).rejects.toThrow('Invalid remote address "bad host".');
    expect(remote.create).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('uses a qualified literal and ignores a saved name for the same host', async () => {
    const { root } = project();
    writeCatalog(root, { lab: { destination: 'elsewhere' } });
    const { managers, remote } = managersWith(liveEntry(), root);
    const target = await resolve(managers, 'admin@devbox');
    expect(remote.create).toHaveBeenCalledTimes(1);
    expect(remote.create.mock.calls[0]?.[1]).toMatchObject({
      address: 'admin@devbox', destination: 'admin@devbox', host: 'devbox',
    });
    expect(target.host).toBe('devbox');
  });

  it('falls back to the literal when no saved name matches', async () => {
    const { root } = project();
    writeCatalog(root, { other: { destination: 'elsewhere' } });
    const { managers, remote } = managersWith(liveEntry(), root);
    const target = await resolve(managers, 'lab');
    expect(remote.create).toHaveBeenCalledTimes(1);
    const address = remote.create.mock.calls[0]?.[1];
    expect(address).toMatchObject({ address: 'lab', destination: 'lab', host: 'lab' });
    expect(address?.path).toBeUndefined();
    expect(target.workspace).toBe('/srv/fresh');
  });

  it('falls back to the literal and reports an unusable catalog once', async () => {
    const { root } = project();
    const file = writeCatalog(root, '{ broken');
    const { managers, remote } = managersWith(liveEntry(), root);
    await resolve(managers, 'lab');
    await resolve(managers, 'lab');
    expect(remote.create).toHaveBeenCalledTimes(2);
    expect(remote.create.mock.calls[0]?.[1]).toMatchObject({ address: 'lab', destination: 'lab' });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      managers, 'manual', 'shell', `Hosts file ${file} is unusable: hosts.json is not valid JSON.`,
    );
  });

  it('matches a saved name case-insensitively and prefers its endpoint over a literal-name entry', async () => {
    const { root } = project();
    writeCatalog(root, { Lab: { destination: 'devbox:2222' } });
    const literal = liveEntry({ address: { destination: 'lab', host: 'lab' } });
    const { managers, remote } = managersWith(literal, root);
    const target = await resolve(managers, 'LAB');
    expect(remote.create).toHaveBeenCalledTimes(1);
    expect(remote.create.mock.calls[0]?.[1]).toMatchObject({
      destination: 'devbox', port: 2222, hostName: 'Lab',
    });
    expect(target.host).toBe('devbox');
  });

  it('launches a pathless miss with the resolved endpoint and no path', async () => {
    const { root } = project();
    writeCatalog(root, { lab: { destination: 'devbox:2222' } });
    const { managers, remote } = managersWith(
      liveEntry({ address: { destination: 'user@other', host: 'other' } }), root,
    );
    const target = await resolve(managers, 'lab');
    expect(remote.create).toHaveBeenCalledTimes(1);
    const address = remote.create.mock.calls[0]?.[1];
    expect(address).toMatchObject({
      address: 'devbox', destination: 'devbox', host: 'devbox', port: 2222, hostName: 'lab',
    });
    expect(address?.path).toBeUndefined();
    expect(target.host).toBe('devbox');
    expect(target.workspace).toBe('/srv/fresh');
  });

  it('keeps the temporary lease on a fresh channel that has no matching session', async () => {
    const { root } = project();
    writeCatalog(root, { lab: { destination: 'devbox:2222' } });
    const { managers, remote } = managersWith(liveEntry(), root);
    await resolve(managers, 'lab');
    const label = remote.create.mock.calls[0]?.[0];
    expect(label).toMatch(/^agent-/);
    expect(remote.acquireAgentLease).toHaveBeenCalledWith(label, expect.stringMatching(/^agent:/));
    expect(remote.release).toHaveBeenCalledWith(label);
  });

  it('opens a fresh channel even when a saved path matches a live endpoint', async () => {
    const { root } = project();
    writeCatalog(root, { lab: { destination: 'devbox:2222', path: '/srv/proj' } });
    const entry = liveEntry({ address: { destination: 'devbox', host: 'devbox', port: 2222 } });
    const { managers, remote } = managersWith(entry, root);
    const target = await resolve(managers, 'lab');
    expect(remote.create).toHaveBeenCalledTimes(1);
    expect(remote.create.mock.calls[0]?.[1]).toMatchObject({
      address: 'devbox:/srv/proj', destination: 'devbox', port: 2222, path: '/srv/proj',
    });
    expect(target.workspace).toBe('/srv/fresh');
  });
});

describe('resolveRemoteAgentTarget endpoint comparison', () => {
  it('reuses a live entry on the same destination with the same explicit port', async () => {
    const { root } = project();
    writeCatalog(root, { lab: { destination: 'devbox:2222' } });
    const entry = liveEntry({ address: { destination: 'devbox', host: 'devbox', port: 2222 } });
    const { managers, remote } = managersWith(entry, root);
    const target = await resolve(managers, 'lab');
    expect(remote.create).not.toHaveBeenCalled();
    expect(target.workspace).toBe('/srv/ws');
    expect(remote.acquireAgentLease).toHaveBeenCalledWith('h1', expect.stringMatching(/^agent:/));
  });

  it('does not reuse a live entry that omits a port the resolved endpoint carries', async () => {
    const { root } = project();
    writeCatalog(root, { lab: { destination: 'devbox:2222' } });
    const entry = liveEntry({ address: { destination: 'devbox', host: 'devbox' } });
    const { managers, remote } = managersWith(entry, root);
    const target = await resolve(managers, 'lab');
    expect(remote.create).toHaveBeenCalledTimes(1);
    expect(remote.create.mock.calls[0]?.[1]).toMatchObject({ destination: 'devbox', port: 2222 });
    expect(target.workspace).toBe('/srv/fresh');
  });

  it('does not reuse a live entry carrying a port the resolved endpoint omits', async () => {
    const entry = liveEntry({ address: { destination: 'devbox', host: 'devbox', port: 2222 } });
    const { managers, remote } = managersWith(entry);
    const target = await resolve(managers, 'devbox');
    expect(remote.create).toHaveBeenCalledTimes(1);
    expect(target.workspace).toBe('/srv/fresh');
  });

  it('prefers the source channel when its port matches the resolved endpoint', async () => {
    const { root } = project();
    writeCatalog(root, { lab: { destination: 'devbox:2222' } });
    const source = liveEntry({
      labels: new Set(['shell']), address: { destination: 'devbox', host: 'devbox', port: 2222 },
      workspaceDir: '/srv/source',
    });
    const other = liveEntry({
      labels: new Set(['h2']), address: { destination: 'devbox', host: 'devbox', port: 2222 },
      workspaceDir: '/srv/other',
    });
    const { managers, remote } = managersWith([source, other], root);
    const target = await resolve(managers, 'lab', 'shell');
    expect(remote.create).not.toHaveBeenCalled();
    expect(target.workspace).toBe('/srv/source');
    expect(remote.acquireAgentLease).toHaveBeenCalledWith('shell', expect.stringMatching(/^agent:/));
  });

  it('does not use the source channel when its port differs from the resolved endpoint', async () => {
    const { root } = project();
    writeCatalog(root, { lab: { destination: 'devbox:2222' } });
    const source = liveEntry({
      labels: new Set(['shell']), address: { destination: 'devbox', host: 'devbox', port: 2223 },
    });
    const { managers, remote } = managersWith(source, root);
    const target = await resolve(managers, 'lab', 'shell');
    expect(remote.create).toHaveBeenCalledTimes(1);
    expect(target.workspace).toBe('/srv/fresh');
  });
});
