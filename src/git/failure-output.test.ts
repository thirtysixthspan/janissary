import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { initGitFailureDirectory, writeGitFailureOutput, clearGitFailureDirectory } from './failure-output.js';

vi.mock('node:fs');

const mockFs = fs as Record<string, ReturnType<typeof vi.fn>>;

const PUSH_FAILURE = new Error([
  'Command failed: git push origin HEAD',
  'error: failed to push some refs to \'github.com:owner/repo.git\'',
  '1:35PM INF no leaks found',
  '',
].join('\n'));

afterEach(() => {
  vi.clearAllMocks();
});

describe('git failure output before a directory is initialized', () => {
  it('writeGitFailureOutput answers no file and writes nothing', () => {
    expect(writeGitFailureOutput('files', Date.UTC(2026, 0, 1), PUSH_FAILURE)).toBeUndefined();
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    expect(mockFs.mkdirSync).not.toHaveBeenCalled();
  });

  it('clearGitFailureDirectory removes nothing', () => {
    clearGitFailureDirectory();
    expect(mockFs.rmSync).not.toHaveBeenCalled();
  });
});

describe('git failure output', () => {
  it('writes a multi-line error\'s full text under .janissary/git-errors, named from label and time', () => {
    mockFs.mkdirSync.mockImplementation(() => {});
    mockFs.writeFileSync.mockImplementation(() => {});
    initGitFailureDirectory('/test/project');
    const file = writeGitFailureOutput('files', Date.UTC(2026, 6, 10, 18, 30, 5, 123), PUSH_FAILURE);
    expect(file).toBe('/test/project/.janissary/git-errors/files-2026-07-10T18-30-05-123Z.log');
    expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/project/.janissary/git-errors', { recursive: true });
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(file, PUSH_FAILURE.message);
  });

  it('accepts an error already reduced to its text', () => {
    mockFs.mkdirSync.mockImplementation(() => {});
    mockFs.writeFileSync.mockImplementation(() => {});
    initGitFailureDirectory('/test/project');
    const file = writeGitFailureOutput('notes.md', Date.UTC(2026, 0, 1), 'push rejected\nhint: pull first');
    expect(file).toContain('notes-md-2026-01-01T00-00-00-000Z.log');
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(file, 'push rejected\nhint: pull first');
  });

  it('writes nothing for a one-line error, which the notification already shows whole', () => {
    initGitFailureDirectory('/test/project');
    expect(writeGitFailureOutput('files', Date.UTC(2026, 0, 1), new Error('no upstream branch\n'))).toBeUndefined();
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  it('reports a failed write as no file rather than throwing', () => {
    mockFs.mkdirSync.mockImplementation(() => {});
    mockFs.writeFileSync.mockImplementation(() => { throw new Error('ENOSPC'); });
    initGitFailureDirectory('/test/project');
    expect(writeGitFailureOutput('files', Date.UTC(2026, 0, 1), PUSH_FAILURE)).toBeUndefined();
  });

  it('reports a directory that cannot be created the same way', () => {
    mockFs.mkdirSync.mockImplementation(() => { throw new Error('EACCES'); });
    initGitFailureDirectory('/test/project');
    expect(writeGitFailureOutput('files', Date.UTC(2026, 0, 1), PUSH_FAILURE)).toBeUndefined();
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  it('clearGitFailureDirectory removes the git-errors directory', () => {
    mockFs.rmSync.mockImplementation(() => {});
    initGitFailureDirectory('/test/project');
    clearGitFailureDirectory();
    expect(mockFs.rmSync).toHaveBeenCalledWith('/test/project/.janissary/git-errors', { recursive: true, force: true });
  });

  it('clearGitFailureDirectory ignores removal errors', () => {
    mockFs.rmSync.mockImplementation(() => { throw new Error('permission denied'); });
    initGitFailureDirectory('/test/project');
    expect(() => clearGitFailureDirectory()).not.toThrow();
  });
});
