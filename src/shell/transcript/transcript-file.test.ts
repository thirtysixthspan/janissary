import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import {
  initShellTranscriptDirectory,
  ensureShellTranscriptDirectory,
  shellTranscriptPath,
  clearShellTranscriptDirectory,
} from './transcript-file.js';

vi.mock('node:fs');

const mockFs = fs as Record<string, ReturnType<typeof vi.fn>>;

afterEach(() => {
  vi.clearAllMocks();
});

describe('shell-transcript-file', () => {
  it('ensures a directory distinct from the other transcript directories', () => {
    mockFs.mkdirSync.mockImplementation(() => {});
    initShellTranscriptDirectory('/test/project');
    ensureShellTranscriptDirectory();
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(
      path.join('/test/project', '.janissary', 'shell-transcripts'),
      { recursive: true },
    );
  });

  it('builds a .txt filename from label and startedAt', () => {
    initShellTranscriptDirectory('/test/project');
    const file = shellTranscriptPath('zsh', Date.UTC(2026, 6, 10, 18, 30, 5, 123));
    expect(file).toBe(path.join(
      '/test/project', '.janissary', 'shell-transcripts', 'zsh-2026-07-10T18-30-05-123Z.txt',
    ));
  });
});

describe('clearShellTranscriptDirectory', () => {
  it('removes the directory recursively and tolerates a second clear', () => {
    mockFs.rmSync.mockImplementation(() => {});
    initShellTranscriptDirectory('/test/project');

    clearShellTranscriptDirectory();
    expect(mockFs.rmSync).toHaveBeenCalledWith(
      path.join('/test/project', '.janissary', 'shell-transcripts'),
      { recursive: true, force: true },
    );

    expect(() => { clearShellTranscriptDirectory(); }).not.toThrow();
  });

  it('ignores a removal that throws, so a fresh launch is never blocked by a stale directory', () => {
    mockFs.rmSync.mockImplementation(() => { throw new Error('directory busy'); });
    initShellTranscriptDirectory('/test/project');
    expect(() => { clearShellTranscriptDirectory(); }).not.toThrow();
  });

  it('removes nothing before a directory has been chosen', async () => {
    // The directory is module state, so a fresh import stands where a process before boot stands.
    vi.resetModules();
    const freshFs = await import('node:fs');
    const fresh = await import('./transcript-file.js');
    fresh.clearShellTranscriptDirectory();
    expect(freshFs.rmSync).not.toHaveBeenCalled();
  });
});
