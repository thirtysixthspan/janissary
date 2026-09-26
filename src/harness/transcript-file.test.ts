import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import {
  initHarnessTranscriptDirectory,
  ensureHarnessTranscriptDirectory,
  harnessTranscriptPath,
  clearHarnessTranscriptDirectory,
} from './transcript-file.js';

vi.mock('node:fs');

const mockFs = fs as Record<string, ReturnType<typeof vi.fn>>;

afterEach(() => {
  vi.clearAllMocks();
});

// Only what differs from `recording-file.ts` is asserted here: the directory name and the `.txt`
// extension. The quartet's shared semantics (recursive create, clear, "ignores removal errors")
// are already covered by `recording-file.test.ts` against the same builder.
describe('harness-transcript-file', () => {
  it('ensures a directory distinct from the pre-existing .janissary/transcripts/', () => {
    mockFs.mkdirSync.mockImplementation(() => {});
    initHarnessTranscriptDirectory('/test/project');
    ensureHarnessTranscriptDirectory();
    const call = mockFs.mkdirSync.mock.calls[0];
    expect(call[0]).toBe(path.join('/test/project', '.janissary', 'harness-transcripts'));
  });

  it('builds a .txt filename from label and startedAt', () => {
    initHarnessTranscriptDirectory('/test/project');
    const file = harnessTranscriptPath('claude', Date.UTC(2026, 6, 10, 18, 30, 5, 123));
    expect(file).toContain('claude-2026-07-10T18-30-05-123Z.txt');
  });
});

// `recording-file.test.ts` covers the quartet's shared clear semantics, but against the *recording*
// builder: coverage is attributed per file, so this file's own clear is its own to answer.
describe('clearHarnessTranscriptDirectory', () => {
  it('removes the directory recursively and tolerates a second clear', () => {
    mockFs.rmSync.mockImplementation(() => {});
    initHarnessTranscriptDirectory('/test/project');

    clearHarnessTranscriptDirectory();
    expect(mockFs.rmSync).toHaveBeenCalledWith(
      path.join('/test/project', '.janissary', 'harness-transcripts'),
      { recursive: true, force: true },
    );

    // `force` is what makes the second call a no-op rather than a throw, and both callers can reach
    // it after another clear has already run.
    expect(() => { clearHarnessTranscriptDirectory(); }).not.toThrow();
  });

  it('ignores a removal that throws, so a fresh launch is never blocked by a stale directory', () => {
    mockFs.rmSync.mockImplementation(() => { throw new Error('directory busy'); });
    initHarnessTranscriptDirectory('/test/project');
    expect(() => { clearHarnessTranscriptDirectory(); }).not.toThrow();
  });

  it('removes nothing before a directory has been chosen', async () => {
    // The directory is module state, so a fresh import is the only way to stand where a process that
    // has not yet run its boot sequence stands.
    vi.resetModules();
    const fresh = await import('./transcript-file.js');
    expect(() => { fresh.clearHarnessTranscriptDirectory(); }).not.toThrow();
  });
});
