import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expandGlob } from './open-glob.js';

describe('expandGlob', () => {
  let root: string;
  const at = (...parts: string[]) => path.join(root, ...parts);
  const names = (matches: string[]) => matches.map((match) => path.relative(root, match));

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-open-glob-'));
    for (const name of ['a.png', 'b.png', 'c.txt', 'd.jpg']) writeFileSync(at(name), '');
    mkdirSync(at('sub'));
    writeFileSync(at('sub', 'e.png'), '');
    mkdirSync(at('shots'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // The four forms `isGlobPattern` advertises, so a pattern that expanded through the shell still
  // expands now.
  it('expands a star', () => {
    expect(names(expandGlob('*.png', root))).toEqual(['a.png', 'b.png']);
  });

  it('expands a single-character wildcard', () => {
    expect(names(expandGlob('?.txt', root))).toEqual(['c.txt']);
  });

  it('expands a character class', () => {
    expect(names(expandGlob('[ab].png', root))).toEqual(['a.png', 'b.png']);
  });

  it('expands braces, including inside an extension', () => {
    expect(names(expandGlob('{a,c}.*', root))).toEqual(['a.png', 'c.txt']);
    expect(names(expandGlob('*.{png,jpg}', root))).toEqual(['a.png', 'b.png', 'd.jpg']);
  });

  it('resolves relative matches against the given directory', () => {
    const matches = expandGlob('*.png', root);

    expect(matches.every((match) => path.isAbsolute(match))).toBe(true);
    expect(matches).toEqual([at('a.png'), at('b.png')]);
  });

  it('expands a pattern naming a subdirectory', () => {
    expect(names(expandGlob('sub/*.png', root))).toEqual([path.join('sub', 'e.png')]);
  });

  // A directory is not something `open` can hand to an opener, so it is dropped — leaving a pattern
  // that matches only directories with nothing, which the caller reports as no matching files.
  it('drops directories', () => {
    expect(expandGlob('s*', root)).toEqual([]);
    expect(names(expandGlob('*', root))).toEqual(['a.png', 'b.png', 'c.txt', 'd.jpg']);
  });

  it('returns an empty list for a pattern that matches nothing', () => {
    expect(expandGlob('nothing-here-*.png', root)).toEqual([]);
  });

  // `localeCompare`, not the default sort: plain ASCII order puts `Z.png` first.
  it('sorts by localeCompare', () => {
    writeFileSync(at('Z.png'), '');

    expect(names(expandGlob('*.png', root))).toEqual(['a.png', 'b.png', 'Z.png']);
  });

  it('removes duplicates when a pattern matches the same file twice', () => {
    // The brace union asks for `a.png` twice over — once through `*`, once by name.
    const matches = names(expandGlob('{*,a}.png', root));

    expect(matches).toEqual(['a.png', 'b.png']);
    expect(new Set(matches).size).toBe(matches.length);
  });

  // The pattern used to be interpolated raw into a shell command, so anything after a `;` ran. It is
  // matched, never executed: the marker file is the proof that nothing ran.
  it('never executes a pattern carrying shell punctuation', () => {
    const marker = at('pwned.txt');

    expect(expandGlob(`a.png; touch ${marker}`, root)).toEqual([]);
    expect(expandGlob('a.png && touch pwned.txt', root)).toEqual([]);
    expect(expandGlob('$(touch pwned.txt)*.png', root)).toEqual([]);

    expect(existsSync(marker)).toBe(false);
    expect(existsSync(at('pwned.txt'))).toBe(false);
  });
});
