import { describe, expect, it } from 'vitest';
import { spawnFrameState } from './process-state.js';

describe('spawnFrameState', () => {
  it('reports the remote shell identity, location, and launch mode', () => {
    expect(spawnFrameState({
      type: 'spawn', id: 'shell1', program: 'zsh', command: '', mode: 'pty', cols: 80, rows: 24,
      shell: { nonce: 'a'.repeat(32) }, offline: true, cwd: '/remote/workspace/src',
    })).toEqual({
      id: 'shell1', program: 'zsh', mode: 'pty', shell: { nonce: 'a'.repeat(32) },
      offline: true, cwd: '/remote/workspace/src',
    });
  });
});
