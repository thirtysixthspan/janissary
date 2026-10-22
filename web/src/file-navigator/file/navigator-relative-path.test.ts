import { describe, expect, it } from 'vitest';
import {
  joinDropFileNames, joinEditorPaths, joinHarnessPaths, remoteNavigatorPath,
} from './navigator-relative-path';

describe('joinHarnessPaths', () => {
  it('joins paths under the display root in source order', () => {
    expect(joinHarnessPaths('/work', '$root', ['a.ts', 'src/b.ts'])).toBe('$root/a.ts $root/src/b.ts');
  });

  it('tolerates trailing slashes on the roots', () => {
    expect(joinHarnessPaths('/work/', '$root/', ['a.ts'])).toBe('$root/a.ts');
  });

  it('anchors files inside the workspace clone to $workspace', () => {
    expect(joinHarnessPaths('/work/.janissary/workspace/salih', '$root/workspace/salih', ['src/a.ts'], '/work/.janissary/workspace/salih'))
      .toBe('$workspace/salih/src/a.ts');
  });

  it('anchors a tree rooted above the clone only for rows inside it', () => {
    expect(joinHarnessPaths('/work/.janissary/workspace', '$root/workspace', ['salih/a.ts', 'other/b.ts'], '/work/.janissary/workspace/salih'))
      .toBe('$workspace/salih/a.ts $root/workspace/other/b.ts');
  });

  it('uses the display root for a file outside the clone', () => {
    expect(joinHarnessPaths('/work', '$root', ['a.ts'], '/work/.janissary/workspace/salih')).toBe('$root/a.ts');
  });

  it('qualifies remote paths with their host', () => {
    expect(joinHarnessPaths('/remote/ws', '$workspace/ws', ['a.ts', 'src/b.ts'], undefined, 'devbox'))
      .toBe('devbox:/remote/ws/a.ts devbox:/remote/ws/src/b.ts');
  });

  it('keeps the host-qualified form when the remote root is slash', () => {
    expect(remoteNavigatorPath('devbox', '/', 'tmp/a.txt')).toBe('devbox:/tmp/a.txt');
  });
});

describe('joinDropFileNames', () => {
  it('keeps only each file name, joined by spaces for the command bar', () => {
    expect(joinDropFileNames('/work', ['a.ts', 'src/b.ts'])).toBe('a.ts b.ts');
  });

  it('joins file names by newlines for the editor', () => {
    expect(joinDropFileNames('/work', ['src/a.ts', 'src/b.ts'], undefined, '\n')).toBe('a.ts\nb.ts');
  });

  it('keeps the host-qualified absolute form for a remote tree in both separators', () => {
    expect(joinDropFileNames('/remote/ws', ['a.ts', 'src/b.ts'], 'devbox'))
      .toBe('devbox:/remote/ws/a.ts devbox:/remote/ws/src/b.ts');
    expect(joinDropFileNames('/remote/ws', ['src/b.ts'], 'devbox', '\n'))
      .toBe('devbox:/remote/ws/src/b.ts');
  });

  it('produces nothing for an empty list', () => {
    expect(joinDropFileNames('/work', [])).toBe('');
  });
});

describe('joinEditorPaths', () => {
  it('leaves a single tree-relative path as it is', () => {
    expect(joinEditorPaths('/work', ['src/a.ts'])).toBe('src/a.ts');
  });

  it('separates several paths with newlines in source order', () => {
    expect(joinEditorPaths('/work', ['a.ts', 'src/b.ts'])).toBe('a.ts\nsrc/b.ts');
  });

  it('qualifies remote paths with their host, one per line', () => {
    expect(joinEditorPaths('/remote/ws', ['a.ts', 'src/b.ts'], 'devbox'))
      .toBe('devbox:/remote/ws/a.ts\ndevbox:/remote/ws/src/b.ts');
  });

  it('produces nothing for an empty list', () => {
    expect(joinEditorPaths('/work', [])).toBe('');
  });
});
