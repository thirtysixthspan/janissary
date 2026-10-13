import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import xterm from '@xterm/headless';
import { messageBus } from '../../bus.js';
import { initShellTranscriptDirectory } from './transcript-file.js';
import { ShellTranscriptWriter } from './writer.js';

// The writer parses asynchronously and appends through a stream, so each test leaves a sentinel
// (`END`) on the cursor's row, finishes the writer, and polls the file until the sentinel arrives.
// The sentinel is the last thing written, so its arrival means the whole file can be compared exactly.
let projectDir: string;
let transcriptsDir: string;
let writer: ShellTranscriptWriter | undefined;
const locked: string[] = [];

const emit = (event: Parameters<typeof messageBus.emit<'pty'>>[1]) => messageBus.emit('pty', event);
const data = (text: string) => { emit({ type: 'data', id: 'pty-1', data: text }); };

function transcriptFiles(): string[] {
  if (!existsSync(transcriptsDir)) return [];
  return readdirSync(transcriptsDir).filter((f) => f.endsWith('.txt'));
}

async function waitForSentinel(sentinel = 'END'): Promise<string[]> {
  for (let i = 0; i < 400; i++) {
    const files = transcriptFiles();
    if (files.length === 1) {
      const content = readFileSync(path.join(transcriptsDir, files[0]), 'utf8');
      if (content.endsWith(`${sentinel}\n`)) return content.slice(0, -1).split('\n');
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('transcript did not receive its sentinel');
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 400 && !condition(); i++) await new Promise((r) => setTimeout(r, 5));
}

function start(cols = 80, rows = 24, onFailure = vi.fn(), onOpened = vi.fn()): ShellTranscriptWriter {
  writer = new ShellTranscriptWriter('pty-1', 'shell', cols, rows, onFailure, onOpened);
  return writer;
}

async function transcriptOf(input: string, cols = 80, rows = 24): Promise<string[]> {
  start(cols, rows);
  data(input);
  data('END');
  emit({ type: 'exit', id: 'pty-1', exitCode: 0 });
  return waitForSentinel();
}

beforeEach(() => {
  projectDir = mkdtempSync(path.join(tmpdir(), 'shell-transcript-'));
  transcriptsDir = path.join(projectDir, '.janissary', 'shell-transcripts');
  initShellTranscriptDirectory(projectDir);
  writer = undefined;
  locked.length = 0;
});

afterEach(() => {
  writer?.dispose();
  for (const dir of locked) chmodSync(dir, 0o700);
  rmSync(projectDir, { recursive: true, force: true });
});

describe('ShellTranscriptWriter', () => {
  it('writes rendered text without colours or cursor movement', async () => {
    expect(await transcriptOf('\u{1B}[31mred\u{1B}[0m\u{1B}[5C\u{1B}[5D\r\n')).toEqual(['red', 'END']);
  });

  it('writes a prompt line and the command output', async () => {
    expect(await transcriptOf('> ls\r\nfile\r\n')).toEqual(['> ls', 'file', 'END']);
  });

  it('writes a carriage-return progress line once, in its final form', async () => {
    expect(await transcriptOf('10%\r50%\r100%\r\n')).toEqual(['100%', 'END']);
  });

  it('writes a line wider than the terminal as its wrapped rows', async () => {
    expect(await transcriptOf('abcdefghijklmnopqrstuvw\r\n', 10)).toEqual(['abcdefghij', 'klmnopqrst', 'uvw', 'END']);
  });

  it('writes nothing from the alternate screen', async () => {
    const input = 'before\r\n\u{1B}[?1049hvim stuff\r\nmore\r\n\u{1B}[?1049lafter\r\n';
    expect(await transcriptOf(input)).toEqual(['before', 'after', 'END']);
  });

  it('does not write a row again when it is redrawn after being written', async () => {
    expect(await transcriptOf('a\r\nb\r\n\u{1B}[2AX\r\nc\r\nd\r\n')).toEqual(['a', 'b', 'd', 'END']);
  });

  it('writes every row of a burst longer than the scrollback, in order', async () => {
    const numbers = Array.from({ length: 1500 }, (_, i) => String(i));
    const input = numbers.map((n) => `${n}\r\n`).join('');
    expect(await transcriptOf(input)).toEqual([...numbers, 'END']);
  });

  it('neither repeats nor drops rows around a clear', async () => {
    const input = 'a\r\n> clear\r\n\u{1B}[H\u{1B}[2J\u{1B}[3J> ls\r\nfile\r\n';
    expect(await transcriptOf(input)).toEqual(['a', '> clear', '> ls', 'file', 'END']);
  });

  it('neither repeats nor drops rows around a full reset', async () => {
    expect(await transcriptOf('a\r\nb\r\n\u{1B}cx\r\n')).toEqual(['a', 'b', 'x', 'END']);
  });

  it('writes the unfinished cursor row on exit', async () => {
    start();
    data('one\r\n> ');
    data('END');
    emit({ type: 'exit', id: 'pty-1', exitCode: 1 });
    expect(await waitForSentinel('> END')).toEqual(['one', '> END']);
  });

  it('writes the unfinished cursor row on dispose', async () => {
    start();
    data('one\r\nEND');
    writer?.dispose();
    expect(await waitForSentinel()).toEqual(['one', 'END']);
  });

  it('wraps rows written after a resize at the new width', async () => {
    start(10, 24);
    data('abcdefghijklmno\r\n');
    emit({ type: 'resize', id: 'pty-1', cols: 20, rows: 24 });
    data('abcdefghijklmno\r\nEND');
    emit({ type: 'exit', id: 'pty-1', exitCode: 0 });
    expect(await waitForSentinel()).toEqual(['abcdefghij', 'klmno', 'abcdefghijklmno', 'END']);
  });

  it('creates no file before the first output', async () => {
    const onOpened = vi.fn();
    start(80, 24, vi.fn(), onOpened);
    emit({ type: 'resize', id: 'pty-1', cols: 100, rows: 40 });
    writer?.dispose();
    await new Promise((r) => setTimeout(r, 25));
    expect(transcriptFiles()).toEqual([]);
    expect(onOpened).not.toHaveBeenCalled();
  });

  it('opens the file and announces its path on the first output, before any line feed', async () => {
    const onOpened = vi.fn();
    start(80, 24, vi.fn(), onOpened);
    data('% ');
    expect(onOpened).toHaveBeenCalledTimes(1);
    const opened = onOpened.mock.calls[0][0] as string;
    expect(path.dirname(opened)).toBe(transcriptsDir);
    expect(opened.endsWith('.txt')).toBe(true);
    // The append stream opens its file descriptor asynchronously.
    await waitFor(() => existsSync(opened));
    expect(existsSync(opened)).toBe(true);
  });

  it('announces the path exactly once across many data events', async () => {
    const onOpened = vi.fn();
    start(80, 24, vi.fn(), onOpened);
    for (let i = 0; i < 20; i++) data(`line ${i}\r\n`);
    data('END');
    emit({ type: 'exit', id: 'pty-1', exitCode: 0 });
    await waitForSentinel();
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it('reports an unwritable directory once and ignores later events', async () => {
    const lockedParent = path.join(projectDir, 'locked');
    mkdirSync(lockedParent);
    chmodSync(lockedParent, 0o500);
    locked.push(lockedParent);
    initShellTranscriptDirectory(path.join(lockedParent, 'project'));
    const onFailure = vi.fn();
    const onOpened = vi.fn();
    start(80, 24, onFailure, onOpened);

    expect(() => { data('first\r\n'); }).not.toThrow();
    expect(() => {
      data('second\r\n');
      emit({ type: 'exit', id: 'pty-1', exitCode: 0 });
    }).not.toThrow();
    await new Promise((r) => setTimeout(r, 25));

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onOpened).not.toHaveBeenCalled();
    expect(existsSync(path.join(lockedParent, 'project'))).toBe(false);
  });

  it('runs the finishing path once for exit then dispose', async () => {
    start();
    data('a\r\nEND');
    emit({ type: 'exit', id: 'pty-1', exitCode: 0 });
    writer?.dispose();
    expect(await waitForSentinel()).toEqual(['a', 'END']);
    await new Promise((r) => setTimeout(r, 25));
    expect(await waitForSentinel()).toEqual(['a', 'END']);
  });

  it('stops at the unparsed-output cap with one failure and only the rows accepted before it', async () => {
    const onFailure = vi.fn();
    writer = new ShellTranscriptWriter('pty-1', 'shell', 80, 24, onFailure, vi.fn(), 20);
    // xterm parses on a later macrotask, so these back-to-back events all queue before any parse.
    expect(() => {
      data('a\r\nb\r\n');
      data('c\r\n');
      data('x'.repeat(20));
      data('more\r\n');
      emit({ type: 'exit', id: 'pty-1', exitCode: 0 });
    }).not.toThrow();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(() => writer?.dispose()).not.toThrow();
    await waitFor(() => transcriptFiles().length === 1
      && readFileSync(path.join(transcriptsDir, transcriptFiles()[0]), 'utf8') === 'a\nb\nc\n');
    await new Promise((r) => setTimeout(r, 25));
    expect(readFileSync(path.join(transcriptsDir, transcriptFiles()[0]), 'utf8')).toBe('a\nb\nc\n');
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it('releases the unparsed-output count as each chunk is parsed', async () => {
    const onFailure = vi.fn();
    writer = new ShellTranscriptWriter('pty-1', 'shell', 80, 24, onFailure, vi.fn(), 20);
    data('0123456789\r\n');
    await waitFor(() => transcriptFiles().length === 1
      && readFileSync(path.join(transcriptsDir, transcriptFiles()[0]), 'utf8') === '0123456789\n');
    data('abcdefghij\r\n');
    data('END');
    emit({ type: 'exit', id: 'pty-1', exitCode: 0 });
    expect(await waitForSentinel()).toEqual(['0123456789', 'abcdefghij', 'END']);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('reports a write xterm refuses once and never throws from events or dispose', async () => {
    const onFailure = vi.fn();
    start(80, 24, onFailure);
    data('a\r\n');
    await waitFor(() => transcriptFiles().length === 1
      && readFileSync(path.join(transcriptsDir, transcriptFiles()[0]), 'utf8') === 'a\n');
    const refuse = vi.spyOn(xterm.Terminal.prototype, 'write').mockImplementation(() => {
      throw new Error('write data discarded, use flow control to avoid losing data');
    });
    try {
      expect(() => {
        data('b\r\n');
        data('c\r\n');
        emit({ type: 'resize', id: 'pty-1', cols: 100, rows: 40 });
        emit({ type: 'exit', id: 'pty-1', exitCode: 0 });
      }).not.toThrow();
      expect(() => writer?.dispose()).not.toThrow();
    } finally {
      refuse.mockRestore();
    }
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(readFileSync(path.join(transcriptsDir, transcriptFiles()[0]), 'utf8')).toBe('a\n');
  });

  it('closes without throwing when xterm refuses the drain write on dispose', () => {
    const onFailure = vi.fn();
    start(80, 24, onFailure);
    const refuse = vi.spyOn(xterm.Terminal.prototype, 'write').mockImplementation(() => {
      throw new Error('write data discarded, use flow control to avoid losing data');
    });
    try {
      expect(() => writer?.dispose()).not.toThrow();
    } finally {
      refuse.mockRestore();
    }
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('runs the finishing path once for a repeated dispose', async () => {
    start();
    data('a\r\nEND');
    writer?.dispose();
    writer?.dispose();
    expect(await waitForSentinel()).toEqual(['a', 'END']);
    await new Promise((r) => setTimeout(r, 25));
    expect(await waitForSentinel()).toEqual(['a', 'END']);
  });
});
