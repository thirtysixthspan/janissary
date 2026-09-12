import { describe, it, expect, vi } from 'vitest';
import { makeNavigationPort, makeOpenPort } from './manager-ports.js';
import type { PortClosures } from './port.js';
import type { FilesTabState } from './state.js';
import type { Managers } from '../managers.js';

// The two identically-typed closures — `rebuild` and `refreshGit` — are the transposition these
// ports used to be able to express, so each spy has to be told apart by which one was called.
const makeClosures = () => ({
  watchDir: vi.fn(),
  unwatchDir: vi.fn(),
  rebuild: vi.fn(),
  refreshGit: vi.fn(),
}) satisfies PortClosures;

const setCwd = vi.fn();

const fakeManagers = (labels: string[] = ['files']) => ({
  tab: { setCwd, tabs: labels.map((label) => ({ label })) },
}) as unknown as Managers;

const states = () => new Map<string, FilesTabState>();

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
