import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import {
  initHarnessCaptureDirectory,
  ensureCaptureDirectory,
  writeCaptureFile,
  clearCaptureDirectory,
} from './harness-capture-file.js';

vi.mock('node:fs');

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

  it('clearCaptureDirectory removes the captures directory', () => {
    mockFs.rmSync.mockImplementation(() => {});
    initHarnessCaptureDirectory('/test/project');
    clearCaptureDirectory();
    expect(mockFs.rmSync).toHaveBeenCalled();
    const call = mockFs.rmSync.mock.calls[0];
    expect(call[0]).toContain('captures');
    expect(call[1]).toHaveProperty('recursive', true);
    expect(call[1]).toHaveProperty('force', true);
  });

  it('clearCaptureDirectory ignores removal errors', () => {
    mockFs.rmSync.mockImplementation(() => {
      throw new Error('permission denied');
    });
    initHarnessCaptureDirectory('/test/project');
    expect(() => clearCaptureDirectory()).not.toThrow();
  });
});
