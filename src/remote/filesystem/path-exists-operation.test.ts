import { once } from 'node:events';
import { createServer } from 'node:net';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileExistsInTab } from '../../file-exists/tab-exists.js';
import type { TestWorkspace } from './descriptor-test-workspace.js';
import { createWorkspace } from './descriptor-test-workspace.js';
import { pathExistsOperation } from './path-exists-operation.js';

let workspace: TestWorkspace;

beforeEach(() => { workspace = createWorkspace(); });
afterEach(() => workspace.cleanup());

async function run(path: string): Promise<string> {
  const result = await pathExistsOperation.run(workspace.context, pathExistsOperation.decode({ path }));
  return result.text;
}

describe('pathExistsOperation', () => {
  it('validates and decodes its path argument', () => {
    expect(pathExistsOperation.valid({ path: 'src' })).toBe(true);
    expect(pathExistsOperation.valid({})).toBe(false);
    expect(pathExistsOperation.valid({ path: 3 })).toBe(false);
    expect(pathExistsOperation.decode({ path: 'src' })).toEqual({ path: 'src' });
    expect(() => pathExistsOperation.decode({ path: 3 })).toThrow('Invalid remote filesystem operation arguments.');
  });

  it('names its path and treats it as workspace-relative', () => {
    expect(pathExistsOperation.paths({ path: 'src' })).toEqual(['src']);
    expect(pathExistsOperation.rootDestination).toBe(true);
  });

  it.each([
    ['file', 'a.txt'],
    ['dir', 'subdir'],
    ['link', 'link-to-file'],
    ['missing', 'absent'],
  ] as const)('answers %s, matching the local command and never echoing the path', async (word, path) => {
    workspace.makeFile('a.txt');
    workspace.makeDir('subdir');
    workspace.makeLink('link-to-file', 'a.txt');
    const local = fileExistsInTab(workspace.managers(), 'janus', `file exists ${path}`);
    expect(await run(path)).toBe(word);
    expect(await run(path)).toBe(local);
    expect(await run(path)).not.toContain(path);
    expect(local).not.toContain(path);
  });

  it('answers file for a non-regular file type, matching the local command', async () => {
    const socketPath = path.join(workspace.root, 'socket');
    const server = createServer();
    server.listen(socketPath);
    await once(server, 'listening');
    try {
      const local = fileExistsInTab(workspace.managers(), 'janus', 'file exists socket');
      const remote = pathExistsOperation.run(workspace.context, pathExistsOperation.decode({ path: 'socket' }));
      expect(remote.text).toBe('file');
      expect(remote.text).toBe(local);
      expect(remote.text).not.toContain('socket');
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('answers forbidden for a path outside the workspace or a secret path', async () => {
    workspace.makeFile('.env');
    expect(await run('../outside')).toBe('forbidden');
    expect(await run('.env')).toBe('forbidden');
    expect(await run('../outside')).toBe(fileExistsInTab(workspace.managers(), 'janus', 'file exists ../outside'));
    expect(await run('.env')).toBe(fileExistsInTab(workspace.managers(), 'janus', 'file exists .env'));
  });
});
