import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HarnessScreenReader } from './screen.js';
import { messageBus } from '../bus.js';

function emitData(id: string, data: string): void {
  messageBus.emit('pty', { type: 'data', id, data });
}

// Advances past the 1s capture delay plus 1ms: the capture reads the buffer via an async
// xterm write callback whose zero-delay timer lands exactly on the advancement boundary,
// where fake timers defer it to the next tick.
async function advancePastCapture(): Promise<void> {
  await vi.advanceTimersByTimeAsync(1001);
}

describe('HarnessScreenReader', () => {
  let reader: HarnessScreenReader;

  beforeEach(() => {
    vi.useFakeTimers();
    reader = new HarnessScreenReader('pty-1', 80, 24);
  });

  afterEach(() => {
    reader.dispose();
    vi.useRealTimers();
  });

  it('captures the screen 1s after a data event', async () => {
    emitData('pty-1', 'hello world');
    expect(reader.latestCapture()).toBeUndefined();
    await advancePastCapture();
    expect(reader.latestCapture()?.text).toBe('hello world');
  });

  it('drops trailing blank rows below the last content', async () => {
    emitData('pty-1', 'line one\r\nline two');
    await advancePastCapture();
    expect(reader.latestCapture()?.text).toBe('line one\nline two');
  });

  it('does not extend the pending window when more data arrives mid-window', async () => {
    emitData('pty-1', 'first');
    await vi.advanceTimersByTimeAsync(500);
    emitData('pty-1', ' second');
    await vi.advanceTimersByTimeAsync(501);
    expect(reader.latestCapture()?.text).toBe('first second');
  });

  it('schedules a fresh capture after the previous one fires', async () => {
    emitData('pty-1', 'first');
    await advancePastCapture();
    expect(reader.latestCapture()?.text).toBe('first');
    emitData('pty-1', ' second');
    await advancePastCapture();
    expect(reader.latestCapture()?.text).toBe('first second');
  });

  it('never captures when no data arrives', async () => {
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reader.latestCapture()).toBeUndefined();
  });

  it('ignores events for other PTY ids', async () => {
    emitData('pty-other', 'noise');
    await advancePastCapture();
    expect(reader.latestCapture()).toBeUndefined();
  });

  it('tracks resize events so captures wrap at the new width', async () => {
    messageBus.emit('pty', { type: 'resize', id: 'pty-1', cols: 10, rows: 24 });
    emitData('pty-1', 'abcdefghijklmnop');
    await advancePastCapture();
    expect(reader.latestCapture()?.text).toBe('abcdefghij\nklmnop');
  });

  it('disposes on the PTY exit event, cancelling a pending capture', async () => {
    emitData('pty-1', 'about to exit');
    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(reader.latestCapture()).toBeUndefined();
  });

  it('carries the OSC title on captures once one has been set', async () => {
    emitData('pty-1', '\u{1B}]0;⠂ Write a haiku\u{7}some output');
    await advancePastCapture();
    expect(reader.latestCapture()?.title).toBe('⠂ Write a haiku');
    expect(reader.latestCapture()?.text).toBe('some output');
  });

  it('leaves the title undefined when no title sequence has arrived', async () => {
    emitData('pty-1', 'no title here');
    await advancePastCapture();
    expect(reader.latestCapture()?.title).toBeUndefined();
  });

  it('invokes the onCapture callback with each fresh capture', async () => {
    const onCapture = vi.fn();
    const observed = new HarnessScreenReader('pty-cb', 80, 24, onCapture);
    messageBus.emit('pty', { type: 'data', id: 'pty-cb', data: 'watched' });
    await advancePastCapture();
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onCapture.mock.calls[0][0].text).toBe('watched');
    observed.dispose();
  });
});
