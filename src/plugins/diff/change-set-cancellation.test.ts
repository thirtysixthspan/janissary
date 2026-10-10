import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readChangeSet } from './change-set.js';
import { git } from './git.js';

vi.mock('./git.js', () => ({ git: vi.fn() }));
const runGit = vi.mocked(git);

beforeEach(() => { vi.resetAllMocks(); });

describe('change-set cancellation', () => {
  it('propagates an aborted repository check instead of reporting no repository', async () => {
    const controller = new AbortController();
    runGit.mockImplementationOnce((_root, _args, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => { reject(new Error('aborted child read')); }, { once: true });
    }));

    const pending = readChangeSet('/project', new Set(), controller.signal);
    controller.abort();

    await expect(pending).rejects.toThrow('aborted child read');
    expect(runGit).toHaveBeenCalledWith('/project', ['rev-parse', '--show-prefix'], controller.signal);
  });

  it('does not start another untracked batch after the active batch is aborted', async () => {
    const controller = new AbortController();
    const untrackedPaths = Array.from({ length: 9 }, (_, index) => `file-${index}.txt`).join('\0');
    runGit.mockImplementation(async (_root, args, signal) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-prefix') return '';
      if (args[0] === 'rev-parse') return '';
      if (args[0] === 'diff' && args[1] === 'HEAD') return '';
      if (args[0] === 'ls-files') return untrackedPaths;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => { reject(new Error('aborted child read')); }, { once: true });
      });
    });

    const pending = readChangeSet('/project', new Set(), controller.signal);
    await vi.waitFor(() => {
      expect(runGit.mock.calls.filter(([, args]) => args[1] === '--no-index')).toHaveLength(8);
    });
    controller.abort();

    await expect(pending).rejects.toThrow('aborted child read');
    expect(runGit.mock.calls.filter(([, args]) => args[1] === '--no-index')).toHaveLength(8);
  });
});
