import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import {
  initHarnessRecordingDirectory,
  ensureRecordingDirectory,
  harnessRecordingPath,
  clearHarnessRecordingDirectory,
} from './harness-recording-file.js';

vi.mock('node:fs');

const mockFs = fs as Record<string, ReturnType<typeof vi.fn>>;

afterEach(() => {
  vi.clearAllMocks();
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

  it('harnessRecordingPath sanitizes filename-hostile label characters', () => {
    initHarnessRecordingDirectory('/test/project');
    const file = harnessRecordingPath('a/b.c', Date.UTC(2026, 0, 1));
    expect(file).toContain('a-b-c-2026-01-01T00-00-00-000Z.cast');
    expect(file).not.toContain('a/b');
  });

  it('clearHarnessRecordingDirectory removes the recordings directory', () => {
    mockFs.rmSync.mockImplementation(() => {});
    initHarnessRecordingDirectory('/test/project');
    clearHarnessRecordingDirectory();
    expect(mockFs.rmSync).toHaveBeenCalled();
    const call = mockFs.rmSync.mock.calls[0];
    expect(call[0]).toContain('recordings');
    expect(call[1]).toHaveProperty('recursive', true);
    expect(call[1]).toHaveProperty('force', true);
  });

  it('clearHarnessRecordingDirectory ignores removal errors', () => {
    mockFs.rmSync.mockImplementation(() => { throw new Error('permission denied'); });
    initHarnessRecordingDirectory('/test/project');
    expect(() => clearHarnessRecordingDirectory()).not.toThrow();
  });
});
