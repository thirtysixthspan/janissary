import { describe, expect, it, vi } from 'vitest';
import type { TabActivityEntry } from '../api.js';
import { scopeGone } from './scope-gone.js';
import type { SearchScope } from './scope.js';

const local: SearchScope = { kind: 'local', dir: '/repo/clone', label: 'claude-2', display: '$workspace/claude-2' };
const remote: SearchScope = {
  kind: 'remote', dir: '/far/clone', label: 'claude-9', display: '$workspace/claude-9', host: 'box', ride: 'claude-9',
};
const ownRow: TabActivityEntry = {
  label: 'search-1', incarnation: 'i1', dotColor: '#fff', plugin: { id: 'search', instanceKey: 'search' },
};
const otherRow: TabActivityEntry = { label: 'claude-9', incarnation: 'i2', dotColor: '#fff' };

function questions(tracked: boolean, workspace?: Record<string, unknown>) {
  return {
    workspaceTracked: vi.fn(() => tracked),
    originTab: vi.fn(() => (workspace === undefined ? null : { label: 'search-1', workspace }) as never),
  };
}

describe('scopeGone', () => {
  it('never finds the launch directory gone and asks nothing', () => {
    const asked = questions(false, { gone: true });
    expect(scopeGone({ kind: 'launch' }, [ownRow], asked)).toBe(false);
    expect(asked.workspaceTracked).not.toHaveBeenCalled();
    expect(asked.originTab).not.toHaveBeenCalled();
  });

  it('finds a local clone gone exactly when it is no longer tracked', () => {
    const tracked = questions(true);
    expect(scopeGone(local, [], tracked)).toBe(false);
    expect(tracked.workspaceTracked).toHaveBeenCalledWith('/repo/clone');
    expect(scopeGone(local, [], questions(false))).toBe(true);
  });

  it('asks about the search tab\'s own row for a remote scope', () => {
    const gone = questions(true, { ...remote, gone: true });
    expect(scopeGone(remote, [otherRow, ownRow], gone)).toBe(true);
    expect(gone.originTab).toHaveBeenCalledWith('search-1');
  });

  it('does not find a live, offline, or provisioning remote record gone', () => {
    expect(scopeGone(remote, [ownRow], questions(true, { ...remote }))).toBe(false);
    expect(scopeGone(remote, [ownRow], questions(true, { ...remote, offline: true }))).toBe(false);
    expect(scopeGone(remote, [ownRow], questions(true, { ...remote, provisioning: true }))).toBe(false);
  });

  it('does not find a remote scope gone without its own row, and asks nothing', () => {
    const asked = questions(true, { gone: true });
    expect(scopeGone(remote, [otherRow], asked)).toBe(false);
    expect(asked.originTab).not.toHaveBeenCalled();
  });
});
