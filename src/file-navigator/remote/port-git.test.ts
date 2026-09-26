import { describe, expect, it, vi } from 'vitest';
import { RemotePortPaths } from './port-paths.js';
import { remoteGitCommit, remoteGitMetadata, remoteGitPull } from './port-git.js';
import type { GitFileStatus } from '../../git/status.js';

function pathsFor(workspace: string) {
  return new RemotePortPaths(Promise.resolve(workspace));
}

const statuses = (entries: [string, GitFileStatus][]): [string, GitFileStatus][] => entries;

describe('remoteGitMetadata', () => {
  // The far side answers with statuses relative to its own workspace root, so each path is filtered
  // and re-based onto the tree's root — otherwise a navigator rooted below the workspace colours
  // rows for files it is not showing, and misses the ones it is.
  it('re-bases the far side\'s statuses onto the navigator root, keeping the rest', async () => {
    const paths = pathsFor('/ws');
    const request = vi.fn(async () => ({
      statuses: statuses([['src/a.ts', 'changed'], ['docs/c.ts', 'staged'], ['src/sub/d.ts', 'conflict']]),
      branch: 'main', githubUrl: 'https://github.com/o/r',
    }));
    const onResult = vi.fn();

    remoteGitMetadata(request, paths, '/ws/src', onResult);
    await vi.waitFor(() => { expect(onResult).toHaveBeenCalled(); });

    expect(request).toHaveBeenCalledWith('git', {});
    expect(onResult).toHaveBeenCalledExactlyOnceWith({
      statuses: statuses([['a.ts', 'changed'], ['sub/d.ts', 'conflict']]),
      branch: 'main',
      githubUrl: 'https://github.com/o/r',
    });
  });

  it('keeps the statuses as they stand when the navigator is rooted at the workspace', async () => {
    const paths = pathsFor('/ws');
    const request = vi.fn(async () => ({ statuses: statuses([['src/a.ts', 'changed']]) }));
    const onResult = vi.fn();

    remoteGitMetadata(request, paths, '/ws', onResult);
    await vi.waitFor(() => { expect(onResult).toHaveBeenCalled(); });

    expect(onResult).toHaveBeenCalledExactlyOnceWith({ statuses: statuses([['src/a.ts', 'changed']]) });
  });

  // A failed request is "no git metadata" rather than a rejection: the tree renders fine without
  // colouring, and there is nowhere in this callback to put a reason.
  it('reports no metadata when the request failed, rather than throwing', async () => {
    const paths = pathsFor('/ws');
    const request = vi.fn(async () => { throw new Error('not a repository'); });
    const onResult = vi.fn();

    remoteGitMetadata(request, paths, '/ws', onResult);
    await vi.waitFor(() => { expect(onResult).toHaveBeenCalled(); });

    expect(onResult).toHaveBeenCalledExactlyOnceWith({ statuses: [] });
  });
});

describe('remoteGitPull', () => {
  it('carries no path arguments — the far side pulls its own workspace root', async () => {
    const request = vi.fn(async () => 'Already up to date.');
    expect(await remoteGitPull(request)).toBe('Already up to date.');
    expect(request).toHaveBeenCalledExactlyOnceWith('git-pull', {});
  });

  it('passes the far side\'s own outcome summary straight back', async () => {
    const request = vi.fn(async () => { throw new Error('rejected'); });
    await expect(remoteGitPull(request)).rejects.toThrow('rejected');
  });
});

describe('remoteGitCommit', () => {
  it('maps each named path to the remote before it crosses the wire', async () => {
    const paths = pathsFor('/ws');
    const request = vi.fn(async () => ({ committed: true as const, summary: '1 file changed' }));

    const result = await remoteGitCommit(request, paths, '/ws/src', 'commit: a.ts', ['a.ts', 'b.ts']);

    expect(request).toHaveBeenCalledExactlyOnceWith('git-commit', {
      message: 'commit: a.ts', paths: ['src/a.ts', 'src/b.ts'],
    });
    expect(result).toEqual({ committed: true, summary: '1 file changed' });
  });

  // The empty list is the header button's whole-tree form, and the far side has one workspace root
  // shared by every navigator — so "everything" cannot mean the navigator's own subtree. The
  // workspace-relative prefix travels with it, computed the same way a named path is.
  it('sends the workspace-relative prefix as the root for a whole-tree commit', async () => {
    const paths = pathsFor('/ws');
    const request = vi.fn(async () => ({ committed: true as const, summary: '2 files changed' }));

    await remoteGitCommit(request, paths, '/ws/src', 'commit: all', []);

    expect(request).toHaveBeenCalledExactlyOnceWith('git-commit', {
      message: 'commit: all', paths: [], root: 'src',
    });
  });

  it('sends an empty prefix for a navigator rooted at the workspace', async () => {
    const paths = pathsFor('/ws');
    const request = vi.fn(async () => ({ committed: true as const, summary: 'ok' }));
    await remoteGitCommit(request, paths, '/ws', 'commit: all', []);
    expect(request).toHaveBeenCalledWith('git-commit', { message: 'commit: all', paths: [], root: '' });
  });

  it('passes a refusal back rather than reading it as a commit', async () => {
    const paths = pathsFor('/ws');
    const request = vi.fn(async () => ({ committed: false as const }));
    expect(await remoteGitCommit(request, paths, '/ws', 'commit: a.ts', ['a.ts'])).toEqual({ committed: false });
  });
});
