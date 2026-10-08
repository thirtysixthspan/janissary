import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeNavigationPort, makeOpenPort } from './ports.js';
import type { PortClosures } from '../port.js';
import type { FilesTabState } from '../state.js';
import type { Managers } from '../../managers.js';
import { notify } from '../../notifications/index.js';

vi.mock('../../notifications/index.js', () => ({ notify: vi.fn() }));

// The two identically-typed closures — `rebuild` and `refreshGit` — are the transposition these
// ports used to be able to express, so each spy has to be told apart by which one was called.
const makeClosures = () => ({
  watchDir: vi.fn(),
  unwatchDir: vi.fn(),
  rebuild: vi.fn(),
  refreshGit: vi.fn(),
}) satisfies PortClosures;

const setCwd = vi.fn();

const fakeManagers = (
  labels: string[] = ['files'],
  workspaces: Record<string, string | undefined> = {},
  roots: Record<string, string> = {},
) => ({
  tab: {
    setCwd,
    tabs: labels.map((label) => ({ label, ...(workspaces[label] && { workspaceDir: workspaces[label] }) })),
    byLabel: (label: string) => ({ label, ...(workspaces[label] && { workspaceDir: workspaces[label] }) }),
    shorten: (p: string) => roots[p] ?? p,
  },
  remote: { workspaceOf: (label: string) => workspaces[label] },
}) as unknown as Managers;

const states = () => new Map<string, FilesTabState>();

beforeEach(() => { vi.mocked(notify).mockClear(); });

describe('makeNavigationPort', () => {
  it('binds each closure to the member of the same name', () => {
    const closures = makeClosures();
    const port = makeNavigationPort(fakeManagers(), states(), closures);

    port.rebuild('files');

    expect(closures.rebuild).toHaveBeenCalledWith('files');
    expect(closures.refreshGit).not.toHaveBeenCalled();
  });

  it('keeps refreshGit distinct from rebuild', () => {
    const closures = makeClosures();
    const port = makeNavigationPort(fakeManagers(), states(), closures);

    port.refreshGit('files');

    expect(closures.refreshGit).toHaveBeenCalledWith('files');
    expect(closures.rebuild).not.toHaveBeenCalled();
  });

  it('passes the watch arguments through untouched', () => {
    const closures = makeClosures();
    const state = { root: '/root' } as FilesTabState;
    const port = makeNavigationPort(fakeManagers(), states(), closures);

    port.watchDir('files', '/root/src', 'src');
    port.unwatchDir(state, 'src');

    expect(closures.watchDir).toHaveBeenCalledWith('files', '/root/src', 'src');
    expect(closures.unwatchDir).toHaveBeenCalledWith(state, 'src');
  });

  it('carries the state map and answers setCwd and hasTab from the managers', () => {
    const map = states();
    const port = makeNavigationPort(fakeManagers(['files', 'janus']), map, makeClosures());

    port.setCwd('files', '/root/src');

    expect(port.states).toBe(map);
    expect(setCwd).toHaveBeenCalledWith('files', '/root/src');
    expect(port.hasTab('janus')).toBe(true);
    expect(port.hasTab('missing')).toBe(false);
  });

  it('reports a failed local navigation against the abbreviated target', () => {
    const port = makeNavigationPort(fakeManagers(['files'], {}, { '/proj/src': '$root/src' }), states(), makeClosures());

    port.reportFailure('files', '/proj/src', new Error('EACCES: permission denied'));

    expect(notify).toHaveBeenCalledWith(
      expect.anything(), 'manual', 'files', 'Could not navigate to $root/src: EACCES: permission denied.',
    );
  });

  it('reports a remote navigation against the $workspace form, which no local root could shorten', () => {
    const port = makeNavigationPort(
      fakeManagers(['files'], { files: '/srv/.janissary/workspace/emrah' }), states(), makeClosures(),
    );

    port.reportFailure('files', '/srv/.janissary/workspace/emrah/src', new Error('no such directory'));

    expect(notify).toHaveBeenCalledWith(
      expect.anything(), 'manual', 'files',
      'Could not navigate to $workspace/emrah/src: no such directory.',
    );
  });

  it('falls back to the root abbreviation when the target leaves the workspace', () => {
    const port = makeNavigationPort(
      fakeManagers(['files'], { files: '/srv/.janissary/workspace/emrah' }, { '/srv/other': '$root/other' }),
      states(),
      makeClosures(),
    );

    port.reportFailure('files', '/srv/other', new Error('no such directory'));

    expect(notify).toHaveBeenCalledWith(
      expect.anything(), 'manual', 'files', 'Could not navigate to $root/other: no such directory.',
    );
  });
});

describe('makeOpenPort', () => {
  it('binds each closure to the member of the same name', () => {
    const closures = makeClosures();
    const port = makeOpenPort(fakeManagers(), states(), closures);

    port.rebuild('files');
    port.watchDir('files', '/root/src', 'src');

    expect(closures.rebuild).toHaveBeenCalledWith('files');
    expect(closures.refreshGit).not.toHaveBeenCalled();
    expect(closures.watchDir).toHaveBeenCalledWith('files', '/root/src', 'src');
  });

  it('carries the managers and the state map through', () => {
    const managers = fakeManagers();
    const map = states();
    const port = makeOpenPort(managers, map, makeClosures());

    expect(port.managers).toBe(managers);
    expect(port.states).toBe(map);
  });
});
