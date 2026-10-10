import { describe, expect, it, vi } from 'vitest';
import { expandFullFileContext } from './context-diff.js';
import { git } from './git.js';
import type { DiffFile } from './shared.js';

vi.mock('./git.js', () => ({ git: vi.fn() }));
const runGit = vi.mocked(git);

describe('full-file context cancellation', () => {
  it('propagates an aborted Git read instead of recording a context failure', async () => {
    const file: DiffFile = {
      path: 'a.ts', additions: 1, deletions: 1,
      hunks: [{ oldStart: 1, newStart: 1, lines: [] }],
    };
    const controller = new AbortController();
    runGit.mockImplementationOnce((_root, _args, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => { reject(new Error('aborted context read')); }, { once: true });
    }));

    const pending = expandFullFileContext('/project', [file], '', new Set(['a.ts']), controller.signal);
    controller.abort();

    await expect(pending).rejects.toThrow('aborted context read');
    expect(runGit.mock.calls[0]?.[2]).toBe(controller.signal);
  });
});
