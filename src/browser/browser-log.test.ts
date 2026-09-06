import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import {
  initBrowserLogDirectory,
  ensureBrowserLogDirectory,
  writeBrowserLog,
  clearBrowserLogDirectory,
} from './browser-log.js';

vi.mock('node:fs');

const mockFs = fs as Record<string, ReturnType<typeof vi.fn>>;

afterEach(() => {
  vi.clearAllMocks();
});

describe('browser-log', () => {
  it('ensureBrowserLogDirectory creates the browser-logs directory recursively', () => {
    mockFs.mkdirSync.mockImplementation(() => {});
    initBrowserLogDirectory('/test/project');
    ensureBrowserLogDirectory();
    expect(mockFs.mkdirSync).toHaveBeenCalled();
    const call = mockFs.mkdirSync.mock.calls[0];
    expect(call[0]).toContain('.janissary');
    expect(call[0]).toContain('browser-logs');
    expect(call[1]).toHaveProperty('recursive', true);
  });

  it('writeBrowserLog builds the filename from label and endedAt', () => {
    mockFs.mkdirSync.mockImplementation(() => {});
    mockFs.writeFileSync.mockImplementation(() => {});
    initBrowserLogDirectory('/test/project');
    const endedAt = Date.UTC(2026, 6, 10, 18, 30, 5, 123);
    const file = writeBrowserLog('claude', endedAt, 'e2e browser exited (signal SIGSEGV)');
    expect(file).toContain('claude-2026-07-10T18-30-05-123Z.log');
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(file, 'e2e browser exited (signal SIGSEGV)');
  });

  it('writeBrowserLog sanitizes filename-hostile label characters', () => {
    mockFs.mkdirSync.mockImplementation(() => {});
    mockFs.writeFileSync.mockImplementation(() => {});
    initBrowserLogDirectory('/test/project');
    const file = writeBrowserLog('a/b.c', Date.UTC(2026, 0, 1), 'text');
    expect(file).toContain('a-b-c-2026-01-01T00-00-00-000Z.log');
    expect(file).not.toContain('a/b');
  });

  // This runs while a browser death is being reported. A file that cannot be written costs the
  // notification its link and nothing else — it must never throw out of the report.
  it('writeBrowserLog reports a failed write as no file rather than throwing', () => {
    mockFs.mkdirSync.mockImplementation(() => {});
    mockFs.writeFileSync.mockImplementation(() => { throw new Error('ENOSPC'); });
    initBrowserLogDirectory('/test/project');
    expect(writeBrowserLog('claude', Date.UTC(2026, 0, 1), 'text')).toBeUndefined();
  });

  it('writeBrowserLog reports a directory that cannot be created the same way', () => {
    mockFs.mkdirSync.mockImplementation(() => { throw new Error('EACCES'); });
    initBrowserLogDirectory('/test/project');
    expect(writeBrowserLog('claude', Date.UTC(2026, 0, 1), 'text')).toBeUndefined();
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  it('clearBrowserLogDirectory removes the browser-logs directory', () => {
    mockFs.rmSync.mockImplementation(() => {});
    initBrowserLogDirectory('/test/project');
    clearBrowserLogDirectory();
    expect(mockFs.rmSync).toHaveBeenCalled();
    const call = mockFs.rmSync.mock.calls[0];
    expect(call[0]).toContain('browser-logs');
    expect(call[1]).toHaveProperty('recursive', true);
    expect(call[1]).toHaveProperty('force', true);
  });

  it('clearBrowserLogDirectory ignores removal errors', () => {
    mockFs.rmSync.mockImplementation(() => {
      throw new Error('permission denied');
    });
    initBrowserLogDirectory('/test/project');
    expect(() => clearBrowserLogDirectory()).not.toThrow();
  });
});
