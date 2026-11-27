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

  it('reports the MCP decision a harness spawn was launched with', () => {
    expect(spawnFrameState({
      type: 'spawn', id: 'rpty1', program: 'claude', command: 'claude', mode: 'pty', cols: 80, rows: 24,
      harness: 'claude', offline: false, mcp: true,
    })).toEqual({ id: 'rpty1', program: 'claude', mode: 'pty', harness: 'claude', offline: false, mcp: true });
  });
});
