import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import {
  initHarnessRecordingDirectory,
  ensureRecordingDirectory,
  harnessRecordingDirectory,
  harnessRecordingPath,
  reapHarnessRecordings,
} from './recording-file.js';

const { reapFilesOlderThan } = vi.hoisted(() => ({
  reapFilesOlderThan: vi.fn(),
}));

vi.mock('node:fs');
vi.mock('../state/reaper.js', () => ({ reapFilesOlderThan }));

const mockFs = fs as Record<string, ReturnType<typeof vi.fn>>;

afterEach(() => {
  vi.clearAllMocks();
});

// `recordingDirectory` is module state with no reset, so this has to run before anything
// initializes it. Vitest runs a file's blocks in declaration order, which is what makes that true.
describe('harness-recording-file before a directory is initialized', () => {
  // Without the guard the sweep would resolve against the process's working directory and reap a
  // `recordings` directory out of whatever directory the app happened to start in.
  it('reaps nothing before a directory has been chosen', async () => {
    await expect(reapHarnessRecordings(Date.now(), 7)).resolves.toBeUndefined();
    expect(reapFilesOlderThan).not.toHaveBeenCalled();
  });

  // A reader of the directory — `play` searching it for a recording of a given name — has nothing to
  // search until one has been named, and must say so rather than answer the process's own directory.
  it('harnessRecordingDirectory is empty before a directory is initialized', () => {
    expect(harnessRecordingDirectory()).toBe('');
  });
});

describe('harness-recording-file', () => {
  it('ensureRecordingDirectory creates the recordings directory recursively', () => {
    mockFs.mkdirSync.mockImplementation(() => {});
    initHarnessRecordingDirectory('/test/project');
    ensureRecordingDirectory();
    expect(mockFs.mkdirSync).toHaveBeenCalled();
    const call = mockFs.mkdirSync.mock.calls[0];
    expect(call[0]).toContain('.janissary');
    expect(call[0]).toContain('recordings');
    expect(call[1]).toHaveProperty('recursive', true);
  });

  it('harnessRecordingPath builds a .cast filename from label and startedAt', () => {
    initHarnessRecordingDirectory('/test/project');
    const startedAt = Date.UTC(2026, 6, 10, 18, 30, 5, 123);
    const file = harnessRecordingPath('claude', startedAt);
    expect(file).toContain('claude-2026-07-10T18-30-05-123Z.cast');
  });

  // The path the recorders write into, read back by whoever needs to look at what they wrote rather
  // than re-deriving it from the project directory and hoping the two still agree.
  it('harnessRecordingDirectory answers the directory that was initialized', () => {
    initHarnessRecordingDirectory('/test/project');
    expect(harnessRecordingDirectory()).toBe('/test/project/.janissary/recordings');
  });

  it('harnessRecordingPath sanitizes filename-hostile label characters', () => {
    initHarnessRecordingDirectory('/test/project');
    const file = harnessRecordingPath('a/b.c', Date.UTC(2026, 0, 1));
    expect(file).toContain('a-b-c-2026-01-01T00-00-00-000Z.cast');
    expect(file).not.toContain('a/b');
  });

  it('reaps .cast files older than the retention window', async () => {
    initHarnessRecordingDirectory('/test/project');
    const launchedAt = Date.UTC(2026, 6, 10, 18, 30, 5, 123);
    await reapHarnessRecordings(launchedAt, 7);
    expect(reapFilesOlderThan).toHaveBeenCalledOnce();
    expect(reapFilesOlderThan).toHaveBeenCalledWith(
      path.join('/test/project', '.janissary', 'recordings'),
      '.cast',
      launchedAt - 7 * 86_400_000,
    );
  });

  it('uses launch as the cutoff when retention is zero', async () => {
    initHarnessRecordingDirectory('/test/project');
    const launchedAt = Date.UTC(2026, 6, 10, 18, 30, 5, 123);
    await reapHarnessRecordings(launchedAt, 0);
    expect(reapFilesOlderThan).toHaveBeenCalledWith(
      path.join('/test/project', '.janissary', 'recordings'),
      '.cast',
      launchedAt,
    );
  });
});
