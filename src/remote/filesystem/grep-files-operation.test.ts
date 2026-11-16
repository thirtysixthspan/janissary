import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileGrepArgs } from '../../file-grep/command.js';
import { GREP_TIMEOUT_MS } from '../../file-grep/scan.js';
import type { OperationContext } from './operation-types.js';
import { grepFilesOperation } from './grep-files-operation.js';

const workspace = vi.hoisted(() => ({
  grepWorkspace: vi.fn<(root: string, args: FileGrepArgs, deadline: number) => Promise<string>>(),
}));

vi.mock('../../file-grep/grep.js', () => ({ grepWorkspace: workspace.grepWorkspace }));

const ARGS = {
  pattern: 'TODO', include: 'src/**', exclude: '**/*.test.ts',
  literal: false, word: false, caseSensitive: false, limit: 100,
};
const CONTEXT = { root: '/srv/workspace' } as OperationContext;

afterEach(() => {
  vi.restoreAllMocks();
  workspace.grepWorkspace.mockReset();
});

describe('grepFilesOperation', () => {
  it('forwards the root, complete arguments with a present undefined path, and one fresh deadline', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5000);
    workspace.grepWorkspace.mockResolvedValue('src/a.ts:2: TODO');

    const result = await grepFilesOperation.run(CONTEXT, grepFilesOperation.decode(ARGS));

    expect(result).toEqual({ text: 'src/a.ts:2: TODO' });
    expect(workspace.grepWorkspace).toHaveBeenCalledOnce();
    const [root, forwarded, deadline] = workspace.grepWorkspace.mock.calls[0];
    expect(root).toBe(CONTEXT.root);
    expect(Object.hasOwn(forwarded, 'path')).toBe(true);
    expect(forwarded).toStrictEqual({ ...ARGS, path: undefined });
    expect(deadline).toBe(5000 + GREP_TIMEOUT_MS);
  });

  it('turns a synchronous workspace throw into that same rejection', async () => {
    const failure = new Error('the matcher is on fire');
    workspace.grepWorkspace.mockImplementation(() => { throw failure; });

    await expect(grepFilesOperation.run(CONTEXT, grepFilesOperation.decode(ARGS))).rejects.toBe(failure);
    expect(workspace.grepWorkspace).toHaveBeenCalledOnce();
  });

  it('preserves an asynchronous workspace rejection by identity', async () => {
    const failure = new Error('the reader is gone');
    workspace.grepWorkspace.mockRejectedValue(failure);

    await expect(grepFilesOperation.run(CONTEXT, grepFilesOperation.decode(ARGS))).rejects.toBe(failure);
    expect(workspace.grepWorkspace).toHaveBeenCalledOnce();
  });
});
