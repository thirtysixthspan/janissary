import { describe, expect, it } from 'vitest';
import { RemotePortPaths } from './port-paths.js';

// The workspace is a promise because it resolves only once the remote handshake lands; every method
// here is relative to it, so each test builds the paths over a workspace it already knows.
function pathsFor(workspace: string) {
  return new RemotePortPaths(Promise.resolve(workspace));
}

describe('RemotePortPaths.filterMatches', () => {
  it('strips the workspace prefix from every match under the root', async () => {
    const paths = pathsFor('/ws');
    expect(await paths.filterMatches('/ws/src', ['src/a.ts', 'src/lib/b.ts'])).toEqual(['a.ts', 'lib/b.ts']);
  });

  it('drops matches that fall outside the root', async () => {
    const paths = pathsFor('/ws');
    expect(await paths.filterMatches('/ws/src', ['src/a.ts', 'docs/c.ts', '/elsewhere/d.ts']))
      .toEqual(['a.ts']);
  });

  // A sibling whose name merely starts with the root's is a different tree; the trailing separator is
  // what keeps `/ws/src2` out of a `/ws/src` filter.
  it('does not admit a sibling directory that shares the root name as a prefix', async () => {
    const paths = pathsFor('/ws');
    expect(await paths.filterMatches('/ws/src', ['src2/a.ts'])).toEqual([]);
  });

  it('returns the matches untouched when the root is the workspace root', async () => {
    const paths = pathsFor('/ws');
    expect(await paths.filterMatches('/ws', ['a.ts', 'lib/b.ts'])).toEqual(['a.ts', 'lib/b.ts']);
  });
});

describe('RemotePortPaths.filterEntries', () => {
  it('strips the workspace prefix from every entry key and keeps its value', async () => {
    const paths = pathsFor('/ws');
    const entries: [string, number][] = [['src/a.ts', 1], ['src/lib/b.ts', 2]];
    expect(await paths.filterEntries('/ws/src', entries)).toEqual([['a.ts', 1], ['lib/b.ts', 2]]);
  });

  it('drops entries that fall outside the root', async () => {
    const paths = pathsFor('/ws');
    const entries: [string, number][] = [['src/a.ts', 1], ['docs/c.ts', 2]];
    expect(await paths.filterEntries('/ws/src', entries)).toEqual([['a.ts', 1]]);
  });

  it('returns the entries untouched when the root is the workspace root', async () => {
    const paths = pathsFor('/ws');
    const entries: [string, string][] = [['a.ts', 'x'], ['lib/b.ts', 'y']];
    expect(await paths.filterEntries('/ws', entries)).toEqual([['a.ts', 'x'], ['lib/b.ts', 'y']]);
  });
});
