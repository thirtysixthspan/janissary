import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FileSystemPort } from '../../file-navigator/filesystem-port.js';
import { listFilesInTab } from '../../file-list/tab-list.js';
import type { TestWorkspace } from './descriptor-test-workspace.js';
import { createWorkspace } from './descriptor-test-workspace.js';
import { listDirectoryOperation } from './list-directory-operation.js';

let workspace: TestWorkspace;

beforeEach(() => { workspace = createWorkspace(); });
afterEach(() => workspace.cleanup());

async function run(path: string): Promise<string> {
  const result = await listDirectoryOperation.run(workspace.context, listDirectoryOperation.decode({ path }));
  return result.text;
}

describe('listDirectoryOperation', () => {
  it('validates and decodes its path argument', () => {
    expect(listDirectoryOperation.valid({ path: 'src' })).toBe(true);
    expect(listDirectoryOperation.valid({})).toBe(false);
    expect(listDirectoryOperation.valid({ path: 3 })).toBe(false);
    expect(listDirectoryOperation.decode({ path: 'src' })).toEqual({ path: 'src' });
    expect(() => listDirectoryOperation.decode({ path: 3 })).toThrow('Invalid remote filesystem operation arguments.');
  });

  it('names its path and treats it as workspace-relative', () => {
    expect(listDirectoryOperation.paths({ path: 'src' })).toEqual(['src']);
    expect(listDirectoryOperation.rootDestination).toBe(true);
  });

  it('renders a fixed row per entry and filters secret names, matching the local list', async () => {
    workspace.makeFile('beta.md');
    workspace.makeFile('alpha.md');
    workspace.makeFile('.env');
    workspace.makeDir('subdir');
    workspace.fixDir('subdir');
    expect(await run('.')).toBe(await listFilesInTab(workspace.managers(), 'janus', 'file list .'));
    expect(await run('.')).toContain('file -rw-r--r-- 1 2026-11-19T13:50:00.000Z alpha.md');
    expect(await run('.')).not.toContain('.env');
  });

  it('prints (empty directory) for an empty directory, matching the local list', async () => {
    workspace.makeDir('empty');
    expect(await run('empty')).toBe('(empty directory)');
    expect(await run('empty')).toBe(await listFilesInTab(workspace.managers(), 'janus', 'file list empty'));
  });

  it('answers notdir for a file target', async () => {
    workspace.makeFile('a.txt');
    expect(await run('a.txt')).toBe('notdir');
  });

  it('answers forbidden for a path outside the workspace or a secret path', async () => {
    expect(await run('../outside')).toBe('forbidden');
    expect(await run('.env')).toBe('forbidden');
    expect(await run('nested/.env.local')).toBe('forbidden');
  });

  it('answers missing for an absent path', async () => {
    expect(await run('absent')).toBe('missing');
  });

  it('answers forbidden for an unreadable directory, matching the local list', async () => {
    workspace.makeDir('locked');
    const error: NodeJS.ErrnoException = new Error('permission denied');
    error.code = 'EACCES';
    const unreadable = { readDirectory: () => { throw error; } } as unknown as FileSystemPort;
    const result = await listDirectoryOperation.run(
      { ...workspace.context, filesystem: unreadable },
      listDirectoryOperation.decode({ path: 'locked' }),
    );
    expect(result.text).toBe('forbidden');
    expect(result.text).toBe(await listFilesInTab(workspace.managers(), 'janus', 'file list locked', unreadable));
  });
});
