import { describe, it, expect } from 'vitest';
import { parseDiff } from './parse-diff.js';

// The shapes git actually prints, captured from `git diff HEAD -M`, `git diff --no-index -- /dev/null
// <file>`, and the quoted-path and no-newline-at-eof corner cases.

describe('parseDiff', () => {
  // A hunk whose trailing lines are removals, and one that holds nothing but removals.
  const trailingRemovals = [
    'diff --git a/end.txt b/end.txt',
    '--- a/end.txt',
    '+++ b/end.txt',
    '@@ -1,3 +1,2 @@',
    ' one',
    '-two',
    '+new',
    '-three',
  ].join('\n');
  const removedHunk = [
    'diff --git a/gone.txt b/gone.txt',
    'deleted file mode 100644',
    '--- a/gone.txt',
    '+++ /dev/null',
    '@@ -1,2 +0,0 @@',
    '-first',
    '-second',
  ].join('\n');

  it('parses a modified file with its hunk numbers and line kinds', () => {
    const files = parseDiff([
      'diff --git a/a.txt b/a.txt',
      'index 4cb29ea..6addb9b 100644',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,3 +1,4 @@',
      ' one',
      '-two',
      '+TWO',
      ' three',
      '+four',
    ].join('\n'));

    expect(files).toEqual([{
      path: 'a.txt',
      additions: 2,
      deletions: 1,
      hunks: [{
        oldStart: 1,
        newStart: 1,
        lines: [
          { kind: 'context', number: 1, jump: 1, oldNumber: 1, text: 'one' },
          { kind: 'removed', number: 2, jump: 2, oldNumber: 2, text: 'two' },
          { kind: 'added', number: 2, jump: 2, text: 'TWO' },
          { kind: 'context', number: 3, jump: 3, oldNumber: 3, text: 'three' },
          { kind: 'added', number: 4, jump: 4, text: 'four' },
        ],
      }],
    }]);
  });

  it('carries the original side\'s number on a context or removed line and none on an added one', () => {
    const files = parseDiff([
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,3 +1,4 @@',
      ' one',
      '-two',
      '+TWO',
      '+four',
    ].join('\n'));

    const lines = files[0].hunks[0].lines;
    expect(lines.map((line) => line.oldNumber)).toEqual([1, 2, undefined, undefined]);
  });

  it('marks an added file from its /dev/null old side', () => {
    const files = parseDiff([
      'diff --git a/new.txt b/new.txt',
      'new file mode 100644',
      'index 0000000..523b808',
      '--- /dev/null',
      '+++ b/new.txt',
      '@@ -0,0 +1,2 @@',
      '+first',
      '+second',
    ].join('\n'));

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('new.txt');
    expect(files[0].oldPath).toBeUndefined();
    expect(files[0].additions).toBe(2);
    // The header names the file as added, because an append reads as additions with no deletions and
    // the two must not be told apart by counting.
    expect(files[0].added).toBe(true);
  });

  it('leaves an ordinary modification unmarked as added', () => {
    const files = parseDiff([
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,1 +1,2 @@',
      ' one',
      '+two',
    ].join('\n'));

    expect(files[0].added).toBeUndefined();
  });

  it('marks a deleted file from its /dev/null new side, and names it from the old side', () => {
    const files = parseDiff([
      'diff --git a/gone.txt b/gone.txt',
      'deleted file mode 100644',
      'index 523b808..0000000',
      '--- a/gone.txt',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-first',
      '-second',
    ].join('\n'));

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('gone.txt');
    expect(files[0].deleted).toBe(true);
    expect(files[0].deletions).toBe(2);
  });

  it('carries a rename as old and new paths with only its changed hunk', () => {
    const files = parseDiff([
      'diff --git a/a.txt b/renamed.txt',
      'similarity index 52%',
      'rename from a.txt',
      'rename to renamed.txt',
      'index 4cb29ea..6addb9b 100644',
      '--- a/a.txt',
      '+++ b/renamed.txt',
      '@@ -1,3 +1,4 @@',
      ' one',
      '-two',
      '+TWO',
      ' three',
      '+four',
    ].join('\n'));

    expect(files[0].path).toBe('renamed.txt');
    expect(files[0].oldPath).toBe('a.txt');
  });

  it('carries a pure rename, which has no hunks at all', () => {
    const files = parseDiff([
      'diff --git a/old.md b/new.md',
      'similarity index 100%',
      'rename from old.md',
      'rename to new.md',
    ].join('\n'));

    expect(files).toEqual([{ path: 'new.md', oldPath: 'old.md', additions: 0, deletions: 0, hunks: [] }]);
  });

  it('names a mode-only change, which has no hunks and no --- lines', () => {
    const files = parseDiff([
      'diff --git a/script.sh b/script.sh',
      'old mode 100644',
      'new mode 100755',
    ].join('\n'));

    expect(files).toEqual([{ path: 'script.sh', additions: 0, deletions: 0, hunks: [] }]);
  });

  it('marks a binary file with no hunks', () => {
    const files = parseDiff([
      'diff --git a/bin.dat b/bin.dat',
      'index 4386aed..0000000 100644',
      'Binary files a/bin.dat and b/bin.dat differ',
    ].join('\n'));

    expect(files).toHaveLength(1);
    expect(files[0].binary).toBe(true);
    expect(files[0].hunks).toEqual([]);
  });

  it('takes a path with a space from the --- and +++ lines, padding tab included', () => {
    const files = parseDiff([
      'diff --git a/with space.txt b/with space.txt',
      'index 9766475..523b808 100644',
      '--- a/with space.txt\t',
      '+++ b/with space.txt\t',
      '@@ -1 +1 @@',
      '-ok',
      '+ok2',
    ].join('\n'));

    expect(files[0].path).toBe('with space.txt');
  });

  it('decodes a quoted non-ASCII path', () => {
    const files = parseDiff([
      String.raw`diff --git "a/caf\303\251.txt" "b/caf\303\251.txt"`,
      'index 9766475..523b808 100644',
      String.raw`--- "a/caf\303\251.txt"`,
      String.raw`+++ "b/caf\303\251.txt"`,
      '@@ -1 +1 @@',
      '-ok',
      '+ok2',
    ].join('\n'));

    expect(files[0].path).toBe('café.txt');
  });

  it('ignores the no-newline-at-eof marker and keeps the line before it', () => {
    const files = parseDiff([
      'diff --git a/nonl.txt b/nonl.txt',
      '--- a/nonl.txt',
      '+++ b/nonl.txt',
      '@@ -1,3 +1,3 @@',
      ' a',
      ' ',
      '-b',
      '+B',
      ' c',
      String.raw`\ No newline at end of file`,
    ].join('\n'));

    const lines = files[0].hunks[0].lines;
    expect(lines).toHaveLength(5);
    expect(lines[1]).toEqual({ kind: 'context', number: 2, jump: 2, oldNumber: 2, text: '' });
    expect(lines[4]).toEqual({ kind: 'context', number: 4, jump: 4, oldNumber: 4, text: 'c' });
  });

  it('strips the diffed root repo-relative prefix', () => {
    const files = parseDiff([
      'diff --git a/sub/b.txt b/sub/b.txt',
      '--- a/sub/b.txt',
      '+++ b/sub/b.txt',
      '@@ -1 +1 @@',
      '-x',
      '+y',
    ].join('\n'), { prefix: 'sub/' });

    expect(files[0].path).toBe('b.txt');
  });

  it('answers nothing for empty output', () => {
    expect(parseDiff('')).toEqual([]);
  });

  it('leaves no undefined-valued key on a record the caller named', () => {
    // The host validates a published payload with `isJsonCompatible`, which answers false for a
    // property whose value is `undefined` — so a record must omit an absent `oldPath`, not carry it.
    const files = parseDiff([
      'diff --git a/untracked.md b/untracked.md',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/untracked.md',
      '@@ -0,0 +1 @@',
      '+new',
    ].join('\n'), { path: 'untracked.md' });

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('untracked.md');
    expect(files[0].additions).toBe(1);
    expect(files[0].hunks[0].lines[0]).toEqual({ kind: 'added', number: 1, jump: 1, text: 'new' });
    expect(Object.hasOwn(files[0], 'oldPath')).toBe(false);
  });

  it('borrows the next line for a removed line that has one after it', () => {
    const files = parseDiff([
      'diff --git a/mid.txt b/mid.txt',
      '--- a/mid.txt',
      '+++ b/mid.txt',
      '@@ -1,2 +1,2 @@',
      ' one',
      '-two',
      '+new',
    ].join('\n'));
    expect(files[0].hunks[0].lines.map((line) => line.jump)).toEqual([1, 2, 2]);
  });

  it('borrows the previous line when the hunk ends in removed lines', () => {
    const files = parseDiff(trailingRemovals);
    expect(files[0].hunks[0].lines.map((line) => [line.kind, line.jump])).toEqual([
      ['context', 1], ['removed', 2], ['added', 2], ['removed', 2],
    ]);
  });

  it('answers the line above a hunk that holds nothing but removals', () => {
    const files = parseDiff(removedHunk);
    expect(files[0].deleted).toBe(true);
    expect(files[0].hunks[0].lines.map((line) => line.jump)).toEqual([1, 1]);
  });

  it('does not mistake hunk content for a header line', () => {
    const files = parseDiff([
      'diff --git a/script.sh b/script.sh',
      '--- a/script.sh',
      '+++ b/script.sh',
      '@@ -1,2 +1,2 @@',
      '--- old banner',
      '-kept',
      '+++ new banner',
      '+kept2',
    ].join('\n'));

    expect(files).toHaveLength(1);
    expect(files[0].hunks[0].lines.map((line) => line.kind)).toEqual(['removed', 'removed', 'added', 'added']);
    expect(files[0].hunks[0].lines[0].text).toBe('-- old banner');
  });
});
