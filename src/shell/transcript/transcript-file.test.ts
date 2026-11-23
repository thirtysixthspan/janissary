import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import {
  initShellTranscriptDirectory,
  ensureShellTranscriptDirectory,
  shellTranscriptPath,
  reapShellTranscripts,
} from './transcript-file.js';

const { reapFilesOlderThan } = vi.hoisted(() => ({
  reapFilesOlderThan: vi.fn(),
}));

vi.mock('node:fs');
vi.mock('../../state/reaper.js', () => ({ reapFilesOlderThan }));

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
      path.join('/test/project', '.janissary', 'transcripts', 'shell'),
      { recursive: true },
    );
  });

  it('builds a .txt filename from label and startedAt', () => {
    initShellTranscriptDirectory('/test/project');
    const file = shellTranscriptPath('zsh', Date.UTC(2026, 6, 10, 18, 30, 5, 123));
    expect(file).toBe(path.join(
      '/test/project', '.janissary', 'transcripts', 'shell', 'zsh-2026-07-10T18-30-05-123Z.txt',
    ));
  });

  it('reaps .txt files older than the retention window', async () => {
    initShellTranscriptDirectory('/test/project');
    const launchedAt = Date.UTC(2026, 6, 10, 18, 30, 5, 123);
    await reapShellTranscripts(launchedAt, 7);
    expect(reapFilesOlderThan).toHaveBeenCalledOnce();
    expect(reapFilesOlderThan).toHaveBeenCalledWith(
      path.join('/test/project', '.janissary', 'transcripts', 'shell'),
      '.txt',
      launchedAt - 7 * 86_400_000,
    );
  });

  it('uses launch as the cutoff when retention is zero', async () => {
    initShellTranscriptDirectory('/test/project');
    const launchedAt = Date.UTC(2026, 6, 10, 18, 30, 5, 123);
    await reapShellTranscripts(launchedAt, 0);
    expect(reapFilesOlderThan).toHaveBeenCalledWith(
      path.join('/test/project', '.janissary', 'transcripts', 'shell'),
      '.txt',
      launchedAt,
    );
  });

  it('reaps nothing before a directory has been chosen', async () => {
    // The directory is module state, so a fresh import stands where a process before boot stands.
    vi.resetModules();
    const fresh = await import('./transcript-file.js');
    await expect(fresh.reapShellTranscripts(Date.now(), 7)).resolves.toBeUndefined();
    expect(reapFilesOlderThan).not.toHaveBeenCalled();
  });
});
