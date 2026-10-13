import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../../notifications/index.js', () => ({ notify: mocks.notify }));

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BoundedAppendFile } from '../../bounded-append-file.js';
import { messageBus } from '../../bus.js';
import { initShellTranscriptDirectory } from './transcript-file.js';
import { ShellTranscriptManager, SHELL_TRANSCRIPT_SHUTDOWN_WAIT_MS } from './manager.js';
import { ShellTranscriptWriter } from './writer.js';
import type { Managers } from '../../managers.js';

let projectDir: string;
let transcriptsDir: string;
let tabs: Map<string, { label: string; transcript?: string }>;
let manager: ShellTranscriptManager;
const locked: string[] = [];

const emit = (event: Parameters<typeof messageBus.emit<'pty'>>[1]) => messageBus.emit('pty', event);
const data = (id: string, text: string) => { emit({ type: 'data', id, data: text }); };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

function addTab(label: string): { label: string; transcript?: string } {
  const tab = { label };
  tabs.set(label, tab);
  return tab;
}

function makeManager(): ShellTranscriptManager {
  const managers = {
    tab: { byLabel: (label: string) => tabs.get(label) },
    pty: { spawnDimensions: () => ({ cols: 80, rows: 24 }) },
  } as unknown as Managers;
  return new ShellTranscriptManager(managers);
}

function transcriptFiles(): string[] {
  if (!existsSync(transcriptsDir)) return [];
  return readdirSync(transcriptsDir).filter((f) => f.endsWith('.txt'));
}

// The stream failing once its close has begun, as a full disk can on `end()`.
function abandon(file: unknown): void {
  (file as { abandon: () => void }).abandon();
}

function lockTranscriptDirectory(): void {
  const lockedParent = path.join(projectDir, 'locked');
  mkdirSync(lockedParent);
  chmodSync(lockedParent, 0o500);
  locked.push(lockedParent);
  initShellTranscriptDirectory(path.join(lockedParent, 'project'));
}

beforeEach(() => {
  projectDir = mkdtempSync(path.join(tmpdir(), 'shell-transcript-manager-'));
  transcriptsDir = path.join(projectDir, '.janissary', 'shell-transcripts');
  initShellTranscriptDirectory(projectDir);
  tabs = new Map();
  locked.length = 0;
  mocks.notify.mockReset();
  manager = makeManager();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await manager.dispose();
  for (const dir of locked) chmodSync(dir, 0o700);
  rmSync(projectDir, { recursive: true, force: true });
});

describe('ShellTranscriptManager', () => {
  it('remembers the opened transcript on the tab with that label', () => {
    const tab = addTab('shell');
    manager.install('pty-1', 'shell');
    data('pty-1', '% ');
    expect(tab.transcript).toBeDefined();
    expect(path.dirname(tab.transcript ?? '')).toBe(transcriptsDir);
    expect(tab.transcript?.endsWith('.txt')).toBe(true);
  });

  it('opens the transcript without throwing when no tab has that label', async () => {
    manager.install('pty-1', 'gone');
    expect(() => { data('pty-1', '% '); }).not.toThrow();
    await manager.dispose();
    expect(transcriptFiles()).toHaveLength(1);
  });

  it('finishes only the closed tab\'s writers', async () => {
    const first = addTab('first');
    const second = addTab('second');
    const dispose = vi.spyOn(ShellTranscriptWriter.prototype, 'dispose');
    manager.install('pty-1', 'first');
    manager.install('pty-2', 'second');
    data('pty-1', 'a');
    data('pty-2', 'b');

    manager.closeTab('first');
    expect(dispose).toHaveBeenCalledOnce();
    data('pty-1', '\r\nlater');
    data('pty-2', '\r\nmore');
    await Promise.all(dispose.mock.results.map((result) => result.value as Promise<void>));
    await manager.dispose();

    expect(readFileSync(first.transcript ?? '', 'utf8')).toBe('a\n');
    expect(readFileSync(second.transcript ?? '', 'utf8')).toBe('b\nmore\n');
  });

  it('drops a writer whose PTY exited without disposing it again on tab close', () => {
    addTab('shell');
    manager.install('pty-1', 'shell');
    data('pty-1', '% ');
    const dispose = vi.spyOn(ShellTranscriptWriter.prototype, 'dispose');
    emit({ type: 'exit', id: 'pty-1', exitCode: 0 });
    manager.closeTab('shell');
    expect(dispose).not.toHaveBeenCalled();
  });

  it('disposes the earlier writer when an id is installed again, so later rows reach one file', async () => {
    const tab = addTab('shell');
    const dispose = vi.spyOn(ShellTranscriptWriter.prototype, 'dispose');
    manager.install('pty-1', 'shell');
    data('pty-1', 'first');
    const earlier = tab.transcript;
    // Files are named by their start time in milliseconds.
    await pause(5);

    manager.install('pty-1', 'shell');
    expect(dispose).toHaveBeenCalledOnce();
    data('pty-1', 'second');
    await Promise.all(dispose.mock.results.map((result) => result.value as Promise<void>));
    await manager.dispose();

    expect(tab.transcript).not.toBe(earlier);
    expect(readFileSync(earlier ?? '', 'utf8')).toBe('first\n');
    expect(readFileSync(tab.transcript ?? '', 'utf8')).toBe('second\n');
  });

  it('notifies a tab\'s failure once across its writers, and again after the tab is closed', () => {
    lockTranscriptDirectory();
    manager.install('pty-1', 'shell');
    manager.install('pty-2', 'shell');
    data('pty-1', 'one\r\n');
    data('pty-2', 'two\r\n');
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), 'shell-transcript-failed', 'shell');

    manager.closeTab('shell');
    manager.install('pty-3', 'shell');
    data('pty-3', 'three\r\n');
    expect(mocks.notify).toHaveBeenCalledTimes(2);
  });

  it('ignores a failure from a writer its closed tab released, so a later tab with that label still notifies once', async () => {
    addTab('shell');
    manager.install('pty-1', 'shell');
    data('pty-1', 'one');
    const dispose = vi.spyOn(ShellTranscriptWriter.prototype, 'dispose');

    manager.closeTab('shell');
    await Promise.all(dispose.mock.results.map((result) => result.value as Promise<void>));
    // The stream failing once its close has begun, as a full disk can on `end()`.
    const released = dispose.mock.contexts[0] as unknown as { file: { abandon: () => void } };
    released.file.abandon();
    expect(mocks.notify).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    lockTranscriptDirectory();
    manager.install('pty-2', 'shell');
    data('pty-2', 'two\r\n');
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), 'shell-transcript-failed', 'shell');
  });

  it('ignores a late failure from a writer whose PTY exited before its tab closed, so a later tab with that label still notifies once', async () => {
    addTab('shell');
    manager.install('pty-1', 'shell');
    data('pty-1', 'one');
    const writerDispose = vi.spyOn(ShellTranscriptWriter.prototype, 'dispose');
    const fileDispose = vi.spyOn(BoundedAppendFile.prototype, 'dispose');

    emit({ type: 'exit', id: 'pty-1', exitCode: 0 });
    manager.closeTab('shell');
    await vi.waitFor(() => { expect(fileDispose).toHaveBeenCalledOnce(); });
    await (fileDispose.mock.results[0]?.value as Promise<void>);
    expect(writerDispose).not.toHaveBeenCalled();
    abandon(fileDispose.mock.contexts[0]);
    expect(mocks.notify).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    lockTranscriptDirectory();
    manager.install('pty-2', 'shell');
    data('pty-2', 'two\r\n');
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), 'shell-transcript-failed', 'shell');
  });

  it('ignores a closed tab\'s late failure that arrives after a new tab reused its label, so the new tab still notifies once', async () => {
    addTab('shell');
    manager.install('pty-1', 'shell');
    data('pty-1', 'one');
    const writerDispose = vi.spyOn(ShellTranscriptWriter.prototype, 'dispose');
    const fileDispose = vi.spyOn(BoundedAppendFile.prototype, 'dispose');

    emit({ type: 'exit', id: 'pty-1', exitCode: 0 });
    manager.closeTab('shell');
    await vi.waitFor(() => { expect(fileDispose).toHaveBeenCalledOnce(); });
    await (fileDispose.mock.results[0]?.value as Promise<void>);
    expect(writerDispose).not.toHaveBeenCalled();

    manager.install('pty-2', 'shell');
    data('pty-2', 'two');
    abandon(fileDispose.mock.contexts[0]);
    expect(mocks.notify).not.toHaveBeenCalled();

    lockTranscriptDirectory();
    manager.install('pty-3', 'shell');
    data('pty-3', 'three\r\n');
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), 'shell-transcript-failed', 'shell');
  });

  it('notifies a failure from a writer whose PTY exited while its tab is still open', async () => {
    addTab('shell');
    manager.install('pty-1', 'shell');
    data('pty-1', 'one');
    const fileDispose = vi.spyOn(BoundedAppendFile.prototype, 'dispose');

    emit({ type: 'exit', id: 'pty-1', exitCode: 0 });
    await vi.waitFor(() => { expect(fileDispose).toHaveBeenCalledOnce(); });
    await (fileDispose.mock.results[0]?.value as Promise<void>);
    abandon(fileDispose.mock.contexts[0]);
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), 'shell-transcript-failed', 'shell');
  });

  it('returns nothing from dispose when it holds no writers', () => {
    expect(manager.dispose()).toBeUndefined();
  });

  it('has written the unfinished row once dispose resolves', async () => {
    const tab = addTab('shell');
    manager.install('pty-1', 'shell');
    data('pty-1', 'echo hello\r\nhello\r\n> ');
    await manager.dispose();
    expect(readFileSync(tab.transcript ?? '', 'utf8')).toBe('echo hello\nhello\n> \n');
  });

  it('stops waiting for a writer that never settles after the shutdown wait', async () => {
    manager.install('pty-1', 'shell');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      vi.spyOn(ShellTranscriptWriter.prototype, 'dispose').mockReturnValue(new Promise(() => {}));
      let resolved = false;
      const shutdown = manager.dispose();
      void shutdown?.then(() => { resolved = true; });
      await vi.advanceTimersByTimeAsync(SHELL_TRANSCRIPT_SHUTDOWN_WAIT_MS - 1);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
      emit({ type: 'exit', id: 'pty-1', exitCode: 0 });
    }
  });
});
