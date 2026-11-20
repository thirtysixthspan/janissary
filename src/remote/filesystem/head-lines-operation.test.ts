import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FILE_READ_MAX_LIMIT } from '../../file-read/command.js';
import { headTailInTab } from '../../file-head-tail/tab-head-tail.js';
import type { TestWorkspace } from './descriptor-test-workspace.js';
import { createWorkspace } from './descriptor-test-workspace.js';
import { headLinesOperation } from './head-lines-operation.js';

let workspace: TestWorkspace;

beforeEach(() => { workspace = createWorkspace(); });
afterEach(() => workspace.cleanup());

async function run(path: string, count = 2): Promise<string> {
  const result = await headLinesOperation.run(workspace.context, headLinesOperation.decode({ path, count }));
  return result.text;
}

describe('headLinesOperation', () => {
  it('validates a path and a bounded line count', () => {
    expect(headLinesOperation.valid({ path: 'a.txt', count: 1 })).toBe(true);
    expect(headLinesOperation.valid({ path: 'a.txt', count: FILE_READ_MAX_LIMIT })).toBe(true);
    expect(headLinesOperation.valid({ path: 'a.txt' })).toBe(false);
    expect(headLinesOperation.valid({ path: 'a.txt', count: 0 })).toBe(false);
    expect(headLinesOperation.valid({ path: 'a.txt', count: FILE_READ_MAX_LIMIT + 1 })).toBe(false);
    expect(headLinesOperation.decode({ path: 'a.txt', count: 5 })).toEqual({ path: 'a.txt', count: 5 });
    expect(() => headLinesOperation.decode({ path: 'a.txt', count: 0 }))
      .toThrow('Invalid remote filesystem operation arguments.');
  });

  it('names its path and treats it as workspace-relative', () => {
    expect(headLinesOperation.paths({ path: 'src', count: 2 })).toEqual(['src']);
    expect(headLinesOperation.rootDestination).toBe(true);
  });

  it('numbers the first N lines from line 1, matching the local head', async () => {
    workspace.makeFile('a.txt', 'one\ntwo\nthree\nfour\nfive\n');
    const expected = '1\tone\n2\ttwo\n(showing lines 1-2 of 5; continue with --offset 3)';
    expect(await run('a.txt')).toBe(expected);
    expect(await run('a.txt')).toBe(headTailInTab(workspace.managers(), 'janus', 'file head a.txt -n 2'));
  });

  it('prints (empty file) for an empty file', async () => {
    workspace.makeFile('empty.txt', '');
    expect(await run('empty.txt')).toBe('(empty file)');
  });

  it('answers notdir for a directory target, matching the local head', async () => {
    workspace.makeDir('subdir');
    expect(await run('subdir')).toBe('notdir');
    expect(await run('subdir')).toBe(headTailInTab(workspace.managers(), 'janus', 'file head subdir -n 2'));
  });

  it('keeps file read verbose wording for out-of-workspace, secret, and missing paths', async () => {
    expect(await run('../outside')).toBe('Outside the workspace: ../outside.');
    expect(await run('.env')).toBe('Secret file: .env.');
    expect(await run('absent')).toBe('File not found: absent.');
  });
});
