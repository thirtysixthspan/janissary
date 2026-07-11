import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { messageBus } from './bus.js';
import { HarnessRecorder } from './harness-recorder.js';
import { initHarnessRecordingDirectory } from './harness-recording-file.js';

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

beforeEach(() => {
  projectDir = mkdtempSync(path.join(tmpdir(), 'harness-rec-'));
  recordingsDir = path.join(projectDir, '.janissary', 'recordings');
  initHarnessRecordingDirectory(projectDir);
  recorder = undefined;
});

afterEach(() => {
  recorder?.dispose();
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
});
