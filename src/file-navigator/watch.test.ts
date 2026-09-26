import { describe, expect, it, vi } from 'vitest';
import { unwatchDir, watchDir } from './watch.js';
import type { WatchHandle } from './filesystem-port.js';

const handle = (): WatchHandle => ({ stop: vi.fn() });

function stateFor(watch: ReturnType<typeof vi.fn>) {
  return { root: '/ws', filesystem: { watch }, watchers: new Map<string, WatchHandle>() };
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('watchDir', () => {
  it('starts a watch on the tree root and records the handle', () => {
    const started = handle();
    const watch = vi.fn(() => started);
    const state = stateFor(watch);
    const states = new Map([['files-1', state]]);
    const onChange = vi.fn();

    watchDir(states, 'files-1', '/ws/src', 'src', onChange);

    expect(watch).toHaveBeenCalledWith('/ws', 'src', onChange);
    expect(state.watchers.get('src')).toBe(started);
  });

  // An unknown label is a navigator that closed between the tree being drawn and the watch landing;
  // an already-watched path is a redraw. Either way there is nothing to start.
  it('starts nothing for an unknown label or a path already watched', () => {
    const started = handle();
    const watch = vi.fn(() => started);
    const state = stateFor(watch);
    const states = new Map([['files-1', state]]);

    watchDir(states, 'gone', '/ws/src', 'src', vi.fn());
    expect(watch).not.toHaveBeenCalled();

    watchDir(states, 'files-1', '/ws/src', 'src', vi.fn());
    watchDir(states, 'files-1', '/ws/src', 'src', vi.fn());
    expect(watch).toHaveBeenCalledOnce();
  });

  // A remote watch resolves late, and the tab it was for may be gone by then: the handle belongs to
  // the state that is still there, or to nobody, in which case it is stopped rather than leaked.
  it('records a late handle against the state still holding the label', async () => {
    const late = handle();
    const watch = vi.fn(() => Promise.resolve(late));
    const state = stateFor(watch);
    const states = new Map([['files-1', state]]);

    watchDir(states, 'files-1', '/ws/src', 'src', vi.fn());
    expect(state.watchers.size).toBe(0);

    await flush();
    expect(state.watchers.get('src')).toBe(late);
    expect(late.stop).not.toHaveBeenCalled();
  });

  it('stops a late handle whose state was replaced while the watch was in flight', async () => {
    const late = handle();
    const { promise, resolve: land } = Promise.withResolvers<WatchHandle>();
    const watch = vi.fn(() => promise);
    const state = stateFor(watch);
    const states = new Map([['files-1', state]]);

    watchDir(states, 'files-1', '/ws/src', 'src', vi.fn());
    states.set('files-1', stateFor(vi.fn(() => handle())));
    land(late);
    await flush();

    expect(late.stop).toHaveBeenCalledOnce();
  });

  it('stops a late handle whose path was already claimed', async () => {
    const late = handle();
    const { promise, resolve: land } = Promise.withResolvers<WatchHandle>();
    const watch = vi.fn(() => promise);
    const state = stateFor(watch);
    const states = new Map([['files-1', state]]);

    watchDir(states, 'files-1', '/ws/src', 'src', vi.fn());
    const claimed = handle();
    state.watchers.set('src', claimed);
    land(late);
    await flush();

    expect(state.watchers.get('src')).toBe(claimed);
    expect(late.stop).toHaveBeenCalledOnce();
  });

  // A refused or unavailable remote watch is not an error: the tree still works, refreshing on
  // toggle instead of live, so the rejection is swallowed rather than surfacing.
  it('swallows a watch that never lands', async () => {
    const watch = vi.fn(() => Promise.reject(new Error('remote watch unavailable')));
    const state = stateFor(watch);
    const states = new Map([['files-1', state]]);

    watchDir(states, 'files-1', '/ws/src', 'src', vi.fn());
    await flush();

    expect(state.watchers.size).toBe(0);
  });
});

describe('unwatchDir', () => {
  it('stops and forgets the watcher at the path', () => {
    const started = handle();
    const state = stateFor(vi.fn(() => started));
    state.watchers.set('src', started);

    unwatchDir(state, 'src');

    expect(started.stop).toHaveBeenCalledOnce();
    expect(state.watchers.has('src')).toBe(false);
  });

  it('does nothing for a path with no watcher', () => {
    const state = stateFor(vi.fn(() => handle()));
    expect(() => { unwatchDir(state, 'src'); }).not.toThrow();
    expect(state.watchers.size).toBe(0);
  });
});
