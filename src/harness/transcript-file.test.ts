import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import {
  initHarnessTranscriptDirectory,
  ensureHarnessTranscriptDirectory,
  harnessTranscriptPath,
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
