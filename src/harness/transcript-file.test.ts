import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import {
  initHarnessTranscriptDirectory,
  ensureHarnessTranscriptDirectory,
  harnessTranscriptPath,
  reapHarnessTranscripts,
} from './transcript-file.js';

const { reapFilesOlderThan } = vi.hoisted(() => ({
  reapFilesOlderThan: vi.fn(),
}));

vi.mock('node:fs');
vi.mock('../state/reaper.js', () => ({ reapFilesOlderThan }));

const mockFs = fs as Record<string, ReturnType<typeof vi.fn>>;

afterEach(() => {
  vi.clearAllMocks();
});

// Only what differs from `recording-file.ts` is asserted here: the directory name and the `.txt`
// extension. The sweep's cutoff arithmetic and uninitialized guard are covered below.
describe('harness-transcript-file', () => {
  it('ensures .janissary/transcripts/harness under the project', () => {
    mockFs.mkdirSync.mockImplementation(() => {});
    initHarnessTranscriptDirectory('/test/project');
    ensureHarnessTranscriptDirectory();
    const call = mockFs.mkdirSync.mock.calls[0];
    expect(call[0]).toBe(path.join('/test/project', '.janissary', 'transcripts', 'harness'));
  });

  it('builds a .txt filename from label and startedAt', () => {
    initHarnessTranscriptDirectory('/test/project');
    const file = harnessTranscriptPath('claude', Date.UTC(2026, 6, 10, 18, 30, 5, 123));
    expect(file).toBe(path.join('/test/project', '.janissary', 'transcripts', 'harness', 'claude-2026-07-10T18-30-05-123Z.txt'));
  });

  it('reaps .txt files older than the retention window', async () => {
    initHarnessTranscriptDirectory('/test/project');
    const launchedAt = Date.UTC(2026, 6, 10, 18, 30, 5, 123);
    await reapHarnessTranscripts(launchedAt, 7);
    expect(reapFilesOlderThan).toHaveBeenCalledOnce();
    expect(reapFilesOlderThan).toHaveBeenCalledWith(
      path.join('/test/project', '.janissary', 'transcripts', 'harness'),
      '.txt',
      launchedAt - 7 * 86_400_000,
    );
  });

  it('uses launch as the cutoff when retention is zero', async () => {
    initHarnessTranscriptDirectory('/test/project');
    const launchedAt = Date.UTC(2026, 6, 10, 18, 30, 5, 123);
    await reapHarnessTranscripts(launchedAt, 0);
    expect(reapFilesOlderThan).toHaveBeenCalledWith(
      path.join('/test/project', '.janissary', 'transcripts', 'harness'),
      '.txt',
      launchedAt,
    );
  });

  it('reaps nothing before a directory has been chosen', async () => {
    // The directory is module state, so a fresh import is the only way to stand where a process that
    // has not yet run its boot sequence stands.
    vi.resetModules();
    const fresh = await import('./transcript-file.js');
    await expect(fresh.reapHarnessTranscripts(Date.now(), 7)).resolves.toBeUndefined();
    expect(reapFilesOlderThan).not.toHaveBeenCalled();
  });
});
