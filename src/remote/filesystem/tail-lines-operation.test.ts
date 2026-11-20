import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FILE_READ_MAX_LIMIT } from '../../file-read/command.js';
import { headTailInTab } from '../../file-head-tail/tab-head-tail.js';
import type { TestWorkspace } from './descriptor-test-workspace.js';
import { createWorkspace } from './descriptor-test-workspace.js';
import { tailLinesOperation } from './tail-lines-operation.js';

let workspace: TestWorkspace;

beforeEach(() => { workspace = createWorkspace(); });
afterEach(() => workspace.cleanup());

async function run(path: string, count = 2): Promise<string> {
  const result = await tailLinesOperation.run(workspace.context, tailLinesOperation.decode({ path, count }));
  return result.text;
}

describe('tailLinesOperation', () => {
  it('validates a path and a bounded line count', () => {
    expect(tailLinesOperation.valid({ path: 'a.txt', count: 1 })).toBe(true);
    expect(tailLinesOperation.valid({ path: 'a.txt', count: FILE_READ_MAX_LIMIT })).toBe(true);
    expect(tailLinesOperation.valid({ path: 'a.txt' })).toBe(false);
    expect(tailLinesOperation.valid({ path: 'a.txt', count: 0 })).toBe(false);
    expect(tailLinesOperation.valid({ path: 'a.txt', count: FILE_READ_MAX_LIMIT + 1 })).toBe(false);
    expect(tailLinesOperation.decode({ path: 'a.txt', count: 5 })).toEqual({ path: 'a.txt', count: 5 });
    expect(() => tailLinesOperation.decode({ path: 'a.txt', count: 0 }))
      .toThrow('Invalid remote filesystem operation arguments.');
  });

  it('names its path and treats it as workspace-relative', () => {
    expect(tailLinesOperation.paths({ path: 'src', count: 2 })).toEqual(['src']);
    expect(tailLinesOperation.rootDestination).toBe(true);
  });

  it('numbers the last N lines with absolute positions, matching the local tail', async () => {
    workspace.makeFile('a.txt', 'one\ntwo\nthree\nfour\nfive\n');
    expect(await run('a.txt')).toBe('4\tfour\n5\tfive');
    expect(await run('a.txt')).toBe(headTailInTab(workspace.managers(), 'janus', 'file tail a.txt -n 2'));
  });

  it('prints (empty file) for an empty file', async () => {
    workspace.makeFile('empty.txt', '');
    expect(await run('empty.txt')).toBe('(empty file)');
  });

  it('answers notdir for a directory target, matching the local tail', async () => {
    workspace.makeDir('subdir');
    expect(await run('subdir')).toBe('notdir');
    expect(await run('subdir')).toBe(headTailInTab(workspace.managers(), 'janus', 'file tail subdir -n 2'));
  });

  it('keeps file read verbose wording for out-of-workspace, secret, and missing paths', async () => {
    expect(await run('../outside')).toBe('Outside the workspace: ../outside.');
    expect(await run('.env')).toBe('Secret file: .env.');
    expect(await run('absent')).toBe('File not found: absent.');
  });
});
