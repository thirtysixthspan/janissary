import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { messageBus } from '../bus.js';
import { HarnessRecorder } from './recorder.js';
import { initHarnessRecordingDirectory } from './recording-file.js';

// The recorder writes real files with an append stream that flushes asynchronously, so a test
// ends the stream (dispose / exit) and then polls the `.cast` file until it has the expected lines.
let projectDir: string;
let recordingsDir: string;
let recorder: HarnessRecorder | undefined;

const emit = (event: Parameters<typeof messageBus.emit<'pty'>>[1]) => messageBus.emit('pty', event);

async function waitForCastLines(minLines: number): Promise<string[]> {
  for (let i = 0; i < 200; i++) {
    if (existsSync(recordingsDir)) {
      const files = readdirSync(recordingsDir).filter((f) => f.endsWith('.cast'));
      if (files.length > 0) {
        const content = readFileSync(path.join(recordingsDir, files[0]), 'utf8').trim();
        if (content && content.split('\n').length >= minLines) return content.split('\n');
      }
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('cast file did not reach the expected line count');
}

// Directories a test made unwritable, restored before the temp tree is removed so cleanup can
// descend into them.
const locked: string[] = [];

async function waitFor(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i++) await new Promise((r) => setTimeout(r, 5));
}

beforeEach(() => {
  projectDir = mkdtempSync(path.join(tmpdir(), 'harness-rec-'));
  recordingsDir = path.join(projectDir, '.janissary', 'recordings');
  initHarnessRecordingDirectory(projectDir);
  recorder = undefined;
  locked.length = 0;
});

afterEach(() => {
  recorder?.dispose();
  for (const dir of locked) chmodSync(dir, 0o700);
  rmSync(projectDir, { recursive: true, force: true });
});

describe('HarnessRecorder', () => {
  it('writes an asciicast v2 header on the first data event with the spawn dimensions', async () => {
    recorder = new HarnessRecorder('pty-1', 'claude', 'claude', 80, 24);
    emit({ type: 'data', id: 'pty-1', data: 'hello' });
    recorder.dispose();
    const lines = await waitForCastLines(2);
    const header = JSON.parse(lines[0]);
    expect(header.version).toBe(2);
    expect(header.width).toBe(80);
    expect(header.height).toBe(24);
    expect(Number.isSafeInteger(header.timestamp)).toBe(true);
    expect(header.command).toBe('claude');
    expect(header.title).toBe('claude');
    expect(header.env.TERM).toBe('xterm-256color');
    const event = JSON.parse(lines[1]);
    expect(event[1]).toBe('o');
    expect(event[2]).toBe('hello');
    expect(typeof event[0]).toBe('number');
  });

  it('creates no file when only a resize (or nothing) arrives before dispose', async () => {
    recorder = new HarnessRecorder('pty-1', 'claude', 'claude', 80, 24);
    emit({ type: 'resize', id: 'pty-1', cols: 100, rows: 40 });
    recorder.dispose();
    await new Promise((r) => setTimeout(r, 25));
    expect(existsSync(recordingsDir)).toBe(false);
  });

  it('records data chunks as "o" lines with non-decreasing elapsed times and round-trips ESC bytes', async () => {
    recorder = new HarnessRecorder('pty-1', 'claude', 'claude', 80, 24);
    const esc = String.fromCodePoint(27);
    const ansi = `${esc}[31mred${esc}[0m`;
    emit({ type: 'data', id: 'pty-1', data: ansi });
    emit({ type: 'data', id: 'pty-1', data: 'more' });
    recorder.dispose();
    const lines = await waitForCastLines(3);
    const first = JSON.parse(lines[1]);
    const second = JSON.parse(lines[2]);
    expect(first[1]).toBe('o');
    expect(first[2]).toBe(ansi);
    expect(second[0]).toBeGreaterThanOrEqual(first[0]);
  });

  it('a resize before output sets header dims; a resize after output emits an "r" line', async () => {
    recorder = new HarnessRecorder('pty-1', 'claude', 'claude', 80, 24);
    emit({ type: 'resize', id: 'pty-1', cols: 100, rows: 40 });
    emit({ type: 'data', id: 'pty-1', data: 'x' });
    emit({ type: 'resize', id: 'pty-1', cols: 120, rows: 50 });
    recorder.dispose();
    const lines = await waitForCastLines(3);
    const header = JSON.parse(lines[0]);
    expect(header.width).toBe(100);
    expect(header.height).toBe(40);
    expect(JSON.parse(lines[1])[1]).toBe('o');
    const resizeLine = lines.slice(1).map((l) => JSON.parse(l)).find((e) => e[1] === 'r');
    expect(resizeLine[2]).toBe('120x50');
  });

  it('ignores events for a different PTY id', async () => {
    recorder = new HarnessRecorder('pty-1', 'claude', 'claude', 80, 24);
    emit({ type: 'data', id: 'pty-other', data: 'noise' });
    recorder.dispose();
    await new Promise((r) => setTimeout(r, 25));
    expect(existsSync(recordingsDir)).toBe(false);
  });

  it('dispose is idempotent', () => {
    recorder = new HarnessRecorder('pty-1', 'claude', 'claude', 80, 24);
    emit({ type: 'data', id: 'pty-1', data: 'x' });
    expect(() => { recorder!.dispose(); recorder!.dispose(); }).not.toThrow();
  });

  it('an exit event closes the recording', async () => {
    recorder = new HarnessRecorder('pty-1', 'claude', 'claude', 80, 24);
    emit({ type: 'data', id: 'pty-1', data: 'bye' });
    emit({ type: 'exit', id: 'pty-1', exitCode: 0 });
    const lines = await waitForCastLines(2);
    expect(JSON.parse(lines[1])[2]).toBe('bye');
  });

  it('carries the command it was given verbatim into the header, ssh invocation and all', async () => {
    recorder = new HarnessRecorder('pty-1', 'devbox', 'ssh -p 2222 admin@host', 80, 24);
    emit({ type: 'data', id: 'pty-1', data: 'motd' });
    recorder.dispose();
    const lines = await waitForCastLines(2);
    const header = JSON.parse(lines[0]);
    expect(header.command).toBe('ssh -p 2222 admin@host');
    expect(header.title).toBe('devbox');
  });
});

// The recorder never lets a recording problem reach the session, so a caller that cares (the ssh
// path, which reports one notification) learns about it only through the failure callback.
describe('HarnessRecorder failure handling', () => {
  it('reports a stream error once and stops recording', async () => {
    // A read-only recordings directory lets `ensureRecordingDirectory` succeed and fails the stream
    // asynchronously instead — the `'error'` event path.
    mkdirSync(recordingsDir, { recursive: true });
    chmodSync(recordingsDir, 0o500);
    locked.push(recordingsDir);
    const onFailure = vi.fn();

    recorder = new HarnessRecorder('pty-1', 'devbox', 'ssh devbox', 80, 24, onFailure);
    emit({ type: 'data', id: 'pty-1', data: 'first' });
    await waitFor(() => onFailure.mock.calls.length > 0);
    emit({ type: 'data', id: 'pty-1', data: 'second' });
    emit({ type: 'resize', id: 'pty-1', cols: 100, rows: 40 });

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(readdirSync(recordingsDir)).toEqual([]);
  });

  it('reports an open failure once and does not retry the open on later output', async () => {
    // An unwritable parent makes `ensureRecordingDirectory` throw synchronously — the path that used
    // to be swallowed by the bus, leaving the recorder retrying the open on every chunk.
    const lockedParent = path.join(projectDir, 'locked');
    mkdirSync(lockedParent);
    chmodSync(lockedParent, 0o500);
    locked.push(lockedParent);
    initHarnessRecordingDirectory(path.join(lockedParent, 'project'));
    const onFailure = vi.fn();

    recorder = new HarnessRecorder('pty-1', 'devbox', 'ssh devbox', 80, 24, onFailure);
    emit({ type: 'data', id: 'pty-1', data: 'first' });
    expect(onFailure).toHaveBeenCalledTimes(1);

    // Reopening the door proves the recorder gave up rather than retrying: still no file.
    chmodSync(lockedParent, 0o700);
    emit({ type: 'data', id: 'pty-1', data: 'second' });
    await new Promise((r) => setTimeout(r, 25));

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(existsSync(path.join(lockedParent, 'project'))).toBe(false);
  });

  it('leaves a caller that passed no callback failing silently', async () => {
    mkdirSync(recordingsDir, { recursive: true });
    chmodSync(recordingsDir, 0o500);
    locked.push(recordingsDir);

    recorder = new HarnessRecorder('pty-1', 'claude', 'claude', 80, 24);
    expect(() => { emit({ type: 'data', id: 'pty-1', data: 'x' }); }).not.toThrow();
    await new Promise((r) => setTimeout(r, 25));

    expect(readdirSync(recordingsDir)).toEqual([]);
  });
});
