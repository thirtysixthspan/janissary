import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import {
  initHarnessCaptureDirectory,
  ensureCaptureDirectory,
  writeCaptureFile,
  reapHarnessCaptures,
} from './file.js';

const { reapFilesOlderThan } = vi.hoisted(() => ({
  reapFilesOlderThan: vi.fn(),
}));

vi.mock('node:fs');
vi.mock('../../state/reaper.js', () => ({ reapFilesOlderThan }));

const mockFs = fs as Record<string, ReturnType<typeof vi.fn>>;

afterEach(() => {
  vi.clearAllMocks();
});

describe('harness-capture-file', () => {
  it('ensureCaptureDirectory creates the captures directory recursively', () => {
    mockFs.mkdirSync.mockImplementation(() => {});
    initHarnessCaptureDirectory('/test/project');
    ensureCaptureDirectory();
    expect(mockFs.mkdirSync).toHaveBeenCalled();
    const call = mockFs.mkdirSync.mock.calls[0];
    expect(call[0]).toContain('.janissary');
    expect(call[0]).toContain('captures');
    expect(call[1]).toHaveProperty('recursive', true);
  });

  it('writeCaptureFile builds the filename from label and capturedAt', () => {
    mockFs.mkdirSync.mockImplementation(() => {});
    mockFs.writeFileSync.mockImplementation(() => {});
    initHarnessCaptureDirectory('/test/project');
    const capturedAt = Date.UTC(2026, 6, 10, 18, 30, 5, 123);
    const file = writeCaptureFile('claude', capturedAt, 'screen text');
    expect(file).toContain('claude-2026-07-10T18-30-05-123Z.txt');
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(file, 'screen text');
  });

  it('writeCaptureFile sanitizes filename-hostile label characters', () => {
    mockFs.mkdirSync.mockImplementation(() => {});
    mockFs.writeFileSync.mockImplementation(() => {});
    initHarnessCaptureDirectory('/test/project');
    const file = writeCaptureFile('a/b.c', Date.UTC(2026, 0, 1), 'text');
    expect(file).toContain('a-b-c-2026-01-01T00-00-00-000Z.txt');
    expect(file).not.toContain('a/b');
  });

  it('reaps .txt files older than the retention window', async () => {
    initHarnessCaptureDirectory('/test/project');
    const launchedAt = Date.UTC(2026, 6, 10, 18, 30, 5, 123);
    await reapHarnessCaptures(launchedAt, 7);
    expect(reapFilesOlderThan).toHaveBeenCalledOnce();
    expect(reapFilesOlderThan).toHaveBeenCalledWith(
      path.join('/test/project', '.janissary', 'captures'),
      '.txt',
      launchedAt - 7 * 86_400_000,
    );
  });

  it('uses launch as the cutoff when retention is zero', async () => {
    initHarnessCaptureDirectory('/test/project');
    const launchedAt = Date.UTC(2026, 6, 10, 18, 30, 5, 123);
    await reapHarnessCaptures(launchedAt, 0);
    expect(reapFilesOlderThan).toHaveBeenCalledWith(
      path.join('/test/project', '.janissary', 'captures'),
      '.txt',
      launchedAt,
    );
  });

  it('reaps nothing before a directory has been chosen', async () => {
    vi.resetModules();
    const fresh = await import('./file.js');
    await expect(fresh.reapHarnessCaptures(Date.now(), 7)).resolves.toBeUndefined();
    expect(reapFilesOlderThan).not.toHaveBeenCalled();
  });
});
