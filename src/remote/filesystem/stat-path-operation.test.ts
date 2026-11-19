import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { statFileInTab } from '../../file-stat/tab-stat.js';
import type { TestWorkspace } from './descriptor-test-workspace.js';
import { createWorkspace } from './descriptor-test-workspace.js';
import { statPathOperation } from './stat-path-operation.js';

let workspace: TestWorkspace;

beforeEach(() => { workspace = createWorkspace(); });
afterEach(() => workspace.cleanup());

async function run(path: string): Promise<string> {
  const result = await statPathOperation.run(workspace.context, statPathOperation.decode({ path }));
  return result.text;
}

describe('statPathOperation', () => {
  it('validates and decodes its path argument', () => {
    expect(statPathOperation.valid({ path: 'src' })).toBe(true);
    expect(statPathOperation.valid({})).toBe(false);
    expect(statPathOperation.valid({ path: 3 })).toBe(false);
    expect(statPathOperation.decode({ path: 'src' })).toEqual({ path: 'src' });
    expect(() => statPathOperation.decode({ path: 3 })).toThrow('Invalid remote filesystem operation arguments.');
  });

  it('names its path and treats it as workspace-relative', () => {
    expect(statPathOperation.paths({ path: 'src' })).toEqual(['src']);
    expect(statPathOperation.rootDestination).toBe(true);
  });

  it('renders one file row, matching the local stat', async () => {
    workspace.makeFile('a.txt');
    const expected = 'file -rw-r--r-- 1 2026-11-19T13:50:00.000Z a.txt';
    expect(await run('a.txt')).toBe(expected);
    expect(await run('a.txt')).toBe(await statFileInTab(workspace.managers(), 'janus', 'file stat a.txt'));
  });

  it('renders a directory row as one row, matching the local stat', async () => {
    workspace.makeDir('subdir');
    workspace.fixDir('subdir');
    const row = await run('subdir');
    expect(row.startsWith('dir drwxr-xr-x ')).toBe(true);
    expect(row.endsWith(' 2026-11-19T13:50:00.000Z subdir')).toBe(true);
    expect(row).toBe(await statFileInTab(workspace.managers(), 'janus', 'file stat subdir'));
  });

  it('answers forbidden for a path outside the workspace or a secret path', async () => {
    expect(await run('../outside')).toBe('forbidden');
    expect(await run('.env')).toBe('forbidden');
  });

  it('answers missing for an absent path', async () => {
    expect(await run('absent')).toBe('missing');
  });
});
