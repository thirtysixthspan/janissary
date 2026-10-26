import { describe, expect, it, vi } from 'vitest';
import { pathsMoved } from './paths-moved.js';

describe('pathsMoved', () => {
  it('retargets every successful path pair for local trees', () => {
    const retargetEditorTab = vi.fn();
    const managers = { tab: { retargetEditorTab } } as never;
    const state = { root: '/project' } as never;

    pathsMoved(managers, state, [
      { from: 'src', to: 'lib' },
      { from: '/outside/notes.txt', to: '/project/docs/notes.txt' },
    ]);

    expect(retargetEditorTab).toHaveBeenNthCalledWith(1, '/project/src', '/project/lib');
    expect(retargetEditorTab).toHaveBeenNthCalledWith(2, '/outside/notes.txt', '/project/docs/notes.txt');
  });

  it('leaves remote trees untouched', () => {
    const retargetEditorTab = vi.fn();

    pathsMoved(
      { tab: { retargetEditorTab } } as never,
      { root: '/project', remote: { host: 'host', address: 'host:/project' } } as never,
      [{ from: 'src', to: 'lib' }],
    );

    expect(retargetEditorTab).not.toHaveBeenCalled();
  });
});
