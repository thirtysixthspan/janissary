import { describe, expect, it } from 'vitest';
import xterm from '@xterm/headless';
import { ReplayHistory, REPLAY_HISTORY_CHARS } from './replay-history.js';

describe('ReplayHistory', () => {
  it('redraws terminal history and current display without duplicating a previous replay', async () => {
    const history = new ReplayHistory();
    history.record({ type: 'output', id: 'pty', data: 'previous turn\r\nworking' });
    history.record({ type: 'output', id: 'pty', data: '\r\u{1B}[2Kready' });
    const frame = history.frames(true)[0];
    if (frame.type !== 'output') throw new Error('Missing terminal replay');
    const terminal = new xterm.Terminal({ cols: 40, rows: 4, allowProposedApi: true });
    try {
      for (let cycle = 0; cycle < 2; cycle++) {
        await new Promise<void>((resolve) => terminal.write(frame.data, resolve));
        expect(terminal.buffer.active.getLine(0)?.translateToString(true)).toBe('previous turn');
        expect(terminal.buffer.active.getLine(1)?.translateToString(true)).toBe('ready');
        expect(terminal.buffer.active.getLine(2)?.translateToString(true)).toBe('');
      }
    } finally { terminal.dispose(); }
  });

  it('replays transcript blocks only when rebuilding tabs', () => {
    const history = new ReplayHistory();
    history.record({ type: 'transcript', blocks: ['earlier', 'later'] });
    expect(history.frames(false)).toEqual([]);
    expect(history.frames(true)).toEqual([{ type: 'transcript', blocks: ['earlier', 'later'] }]);
    expect(history.frames(true)).toEqual([{ type: 'transcript', blocks: ['earlier', 'later'] }]);
  });

  it('bounds history and keeps the newest part of an oversized terminal chunk', () => {
    const history = new ReplayHistory();
    history.record({ type: 'output', id: 'pty', data: 'old'.repeat(REPLAY_HISTORY_CHARS) + 'latest' });
    const frame = history.frames(true)[0];
    if (frame.type !== 'output') throw new Error('Missing terminal replay');
    expect(history.truncated).toBe(true);
    expect(frame.data).toContain('[earlier remote history trimmed]');
    expect(frame.data.endsWith('latest')).toBe(true);
    expect(frame.data.length).toBeLessThan(REPLAY_HISTORY_CHARS + 100);
  });

  it('bounds transcript history without evicting a quiet terminal display', () => {
    const history = new ReplayHistory();
    history.record({ type: 'output', id: 'quiet', data: 'ready' });
    history.record({ type: 'transcript', blocks: ['y'.repeat(REPLAY_HISTORY_CHARS * 2)] });
    expect(history.frames(true)).toEqual([
      { type: 'output', id: 'quiet', data: '\u{1B}cready' },
      { type: 'transcript', blocks: ['y'.repeat(REPLAY_HISTORY_CHARS)] },
    ]);
    expect(history.truncated).toBe(true);
  });

  it('forgets exited terminals and releases retained history on disposal', () => {
    const history = new ReplayHistory();
    history.record({ type: 'output', id: 'exited', data: 'old output' });
    history.record({ type: 'output', id: 'live', data: 'live output' });
    history.forget('exited');
    expect(history.frames(false)).toEqual([{ type: 'output', id: 'live', data: '\u{1B}clive output' }]);
    history.clear();
    expect(history.frames(true)).toEqual([]);
  });
});
