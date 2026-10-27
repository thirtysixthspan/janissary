import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { completeCommandLine } from './index.js';
import type { FilesCompletions } from './files.js';

let cwd: string;
let otherCwd: string;
let files: FilesCompletions;

beforeAll(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'files-completion-'));
  otherCwd = mkdtempSync(path.join(tmpdir(), 'files-completion-other-'));
  mkdirSync(path.join(cwd, 'src'));
  mkdirSync(path.join(cwd, 'scripts'));
  mkdirSync(path.join(cwd, 'my dir'));
  mkdirSync(path.join(cwd, 'my dir', 'nested folder'));
  mkdirSync(path.join(otherCwd, 'special-folder'));
  writeFileSync(path.join(otherCwd, 'special.md'), '');
  files = {
    labels: ['janus', 'worker', 'remote', 'review team'],
    navigators: ['navigator', 'review notes'],
    workingDirOf: (label) => label === 'worker' || label === 'review team'
      ? otherCwd
      : label === 'janus' ? cwd : undefined,
  };
});

afterAll(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(otherCwd, { recursive: true, force: true });
});

function complete(line: string) {
  return completeCommandLine(line, line.length, cwd, files.labels, [], undefined, undefined, files);
}

describe('files command completion', () => {
  it('puts fixed keywords before matching paths and keeps path matches available', () => {
    const result = complete('files s');
    expect(result.newInput).toBe('files s');
    expect(result.matches).toEqual(['select', 'scripts/', 'src/']);
  });

  it('completes existing detail modes, sides, tab labels, and print targets in their slots', () => {
    expect(complete('files with si').newInput).toBe('files with size ');
    expect(complete('files on ri').newInput).toBe('files on right ');
    expect(complete('files in wo').newInput).toBe('files in worker ');
    expect(complete('files print na').newInput).toBe('files print navigator ');
    expect(complete('files print re').newInput).toBe('files print "review notes" ');
  });

  it('does not complete filesystem paths after the files print target', () => {
    for (const line of ['files print navigator ', 'files print navigator extra']) {
      const result = complete(line);
      expect(result.newInput).toBe(line);
      expect(result.matches).toEqual([]);
    }
  });

  it('keeps filesystem fallback after an ordinary trailing root path', () => {
    const line = 'files expand src scripts ';
    const result = complete(line);
    expect(result.newInput).toBe(line);
    expect(result.matches).toContain('scripts');
  });

  it('omits used once-only clauses while keeping other clauses and paths available', () => {
    const afterIn = complete('files in janus ');
    expect(afterIn.matches).not.toContain('in');
    expect(afterIn.matches).toContain('on');
    expect(afterIn.matches).toContain('with');
    expect(afterIn.matches).toContain('src/');

    const afterOn = complete('files on left ');
    expect(afterOn.matches).not.toContain('on');
    expect(afterOn.matches).toContain('in');
    expect(afterOn.matches).toContain('with');
    expect(afterOn.matches).toContain('src/');

    const afterWith = complete('files with size ');
    expect(afterWith.matches).not.toContain('with');
    expect(afterWith.matches).toContain('in');
    expect(afterWith.matches).toContain('on');
    expect(afterWith.matches).toContain('src/');
  });

  it('completes a clause path against an earlier local in-tab root', () => {
    expect(complete('files in worker expand sp').newInput).toBe('files in worker expand special');
    expect(complete('files in worker sp').newInput).toBe('files in worker special');
  });

  it('uses a decoded quoted local label for clause-path completion', () => {
    expect(complete('files in rev').newInput).toBe('files in "review team" ');
    const result = complete('files in "review team" expand sp');
    expect(result.newInput).toBe('files in "review team" expand special');
    expect(result.matches).toEqual(['special-folder/', 'special.md']);
  });

  it('does not fall back to the issuing cwd for a remote or unknown in-tab root', () => {
    const remote = complete('files in remote expand sr');
    const unknown = complete('files in missing expand sr');
    expect(remote.matches).toEqual([]);
    expect(remote.newInput).toBe('files in remote expand sr');
    expect(unknown.matches).toEqual([]);
    expect(unknown.newInput).toBe('files in missing expand sr');
    expect(complete('files in missing sr').matches).toEqual([]);
  });

  it('offers quoted names with spaces and returns no matches inside an open quote', () => {
    expect(complete('files expand my').newInput).toBe('files expand "my dir"/');
    const openQuote = complete('files expand "my');
    expect(openQuote.matches).toEqual([]);
    expect(openQuote.newInput).toBe('files expand "my');
  });

  it('completes a child path after a quoted directory name', () => {
    const result = complete('files expand "my dir"/ne');
    expect(result.newInput).toBe('files expand "my dir/nested folder"/');
    expect(result.matches).toEqual(['"my dir/nested folder"/']);
  });

  it('resumes clause completion after a completed quoted path', () => {
    const line = 'files expand "my dir"/ ';
    const result = complete(line);
    expect(result.newInput).toBe(line);
    expect(result.matches).toEqual(expect.arrayContaining(['in', 'on', 'with']));
  });
});
