import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messageBus } from '../bus.js';
import { HarnessRecorder, MAX_PENDING_RECORDING_BYTES } from './recorder.js';

let stream: Writable;
let pending: (() => void)[];
let recorder: HarnessRecorder;

vi.mock('node:fs', () => ({ createWriteStream: () => stream }));
vi.mock('./recording-file.js', () => ({
  ensureRecordingDirectory: () => {},
  harnessRecordingPath: () => '/recording.cast',
}));

const emit = (data: string) => messageBus.emit('pty', { type: 'data', id: 'pty-1', data });

beforeEach(() => {
  pending = [];
  stream = new Writable({ write(_chunk, _encoding, done) { pending.push(done); } });
});

afterEach(() => {
  recorder.dispose();
  stream.destroy();
  messageBus.clear();
  vi.restoreAllMocks();
});

describe('HarnessRecorder pending byte budget', () => {
  it('bounds stalled writes, releases resources, and reports once without affecting other PTY listeners', () => {
    const on = vi.spyOn(messageBus, 'on');
    const failure = vi.fn();
    recorder = new HarnessRecorder('pty-1', 'devbox', 'ssh devbox', 80, 24, failure);
    const unsubscribe = vi.spyOn(on.mock.results[0].value, 'unsubscribe');
    const write = vi.spyOn(stream, 'write');
    const destroy = vi.spyOn(stream, 'destroy');
    const end = vi.spyOn(stream, 'end');
    const other = vi.fn();
    messageBus.on('pty', 'data', other);

    for (let n = 0; n < 8; n++) {
      emit('x'.repeat(MAX_PENDING_RECORDING_BYTES / 4));
      expect(stream.writableLength).toBeLessThanOrEqual(MAX_PENDING_RECORDING_BYTES);
    }
    const accepted = write.mock.calls.length;
    messageBus.emit('pty', { type: 'resize', id: 'pty-1', cols: 100, rows: 40 });
    messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 0 });
    recorder.dispose();
    recorder.dispose();

    expect(accepted).toBe(4);
    expect(write).toHaveBeenCalledTimes(accepted);
    expect(failure).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(end).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(8);
    expect(write.mock.calls.some(([line]) => String(line).includes('"x"'))).toBe(false);
  });

  it('counts UTF-8 bytes rather than string characters before accepting an event', () => {
    const failure = vi.fn();
    recorder = new HarnessRecorder('pty-1', 'claude', 'claude', 80, 24, failure);
    const write = vi.spyOn(stream, 'write');
    emit('é'.repeat(MAX_PENDING_RECORDING_BYTES / 2));
    expect(write).toHaveBeenCalledOnce();
    expect(failure).toHaveBeenCalledOnce();
    expect(stream.destroyed).toBe(true);
  });

  it('applies the same budget to the recording header', () => {
    const failure = vi.fn();
    recorder = new HarnessRecorder('pty-1', 'devbox', 'x'.repeat(MAX_PENDING_RECORDING_BYTES), 80, 24, failure);
    const write = vi.spyOn(stream, 'write');
    emit('hello');
    expect(write).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledOnce();
    expect(stream.destroyed).toBe(true);
  });

  it('keeps recording after ordinary stream backpressure drains below the budget', () => {
    const failure = vi.fn();
    recorder = new HarnessRecorder('pty-1', 'claude', 'claude', 80, 24, failure);
    const write = vi.spyOn(stream, 'write');
    emit('a'.repeat(MAX_PENDING_RECORDING_BYTES / 2));
    expect(write.mock.results.at(-1)?.value).toBe(false);
    while (pending.length > 0) pending.shift()!();
    expect(stream.writableLength).toBe(0);
    emit('b'.repeat(MAX_PENDING_RECORDING_BYTES / 2));
    expect(write).toHaveBeenCalledTimes(3);
    expect(stream.writableLength).toBeLessThan(MAX_PENDING_RECORDING_BYTES);
    expect(failure).not.toHaveBeenCalled();
    expect(stream.destroyed).toBe(false);
    while (pending.length > 0) pending.shift()!();
    recorder.dispose();
    expect(stream.writableEnded).toBe(true);
  });
});
