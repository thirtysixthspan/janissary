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

  it('replays a piped shell as history runs when rebuilding tabs, and as output alone otherwise', () => {
    const history = new ReplayHistory();
    history.recordInput('agent', '{ :; ls\n} 2>&1; echo "__JS_END_3_1__"\n');
    history.record({ type: 'output', id: 'agent', data: 'web\n' });
    history.record({ type: 'output', id: 'agent', data: '__JS_END_3_1__\n' });
    expect(history.frames(true)).toEqual([{
      type: 'shell-history',
      id: 'agent',
      runs: [
        { source: 'input', text: '{ :; ls\n} 2>&1; echo "__JS_END_3_1__"\n' },
        { source: 'output', text: 'web\n__JS_END_3_1__\n' },
      ],
    }]);
    // An automatic reconnect replays into a tab that is open and possibly mid-command, whose output
    // scan would match the sentinel inside the recorded input before its command had run.
    expect(history.frames(false)).toEqual([
      { type: 'output', id: 'agent', data: '\u{1B}cweb\n__JS_END_3_1__\n' },
    ]);
  });

  it('leaves a terminal id replaying as output while a piped id beside it replays as history', () => {
    const history = new ReplayHistory();
    history.record({ type: 'output', id: 'pty', data: 'ready' });
    history.recordInput('agent', 'ls\n');
    history.record({ type: 'output', id: 'agent', data: 'web\n' });
    expect(history.frames(true)).toEqual([
      { type: 'output', id: 'pty', data: '\u{1B}cready' },
      { type: 'shell-history', id: 'agent', runs: [
        { source: 'input', text: 'ls\n' }, { source: 'output', text: 'web\n' },
      ] },
    ]);
  });

  it('leads a trimmed history with the earlier-history notice', () => {
    const history = new ReplayHistory();
    history.recordInput('agent', 'x'.repeat(REPLAY_HISTORY_CHARS));
    history.record({ type: 'output', id: 'agent', data: 'latest' });
    const frame = history.frames(true)[0];
    if (frame.type !== 'shell-history') throw new Error('Missing shell history replay');
    expect(history.truncated).toBe(true);
    expect(frame.runs[0]).toEqual({ source: 'output', text: '\r\n[earlier remote history trimmed]\r\n' });
    expect(frame.runs.at(-1)).toEqual({ source: 'output', text: 'latest' });
  });

  it('forgets a piped shell\'s retained input with its output', () => {
    const history = new ReplayHistory();
    history.recordInput('agent', 'ls\n');
    history.record({ type: 'output', id: 'agent', data: 'web\n' });
    history.forget('agent');
    expect(history.frames(true)).toEqual([]);
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
