import { describe, expect, it, vi } from 'vitest';
import { resolveLaunchDir } from './launch-dir.js';
import type { Managers } from '../managers.js';

function managersWith(create: unknown): Managers {
  return { workspace: { create } } as unknown as Managers;
}

describe('resolveLaunchDir', () => {
  it('takes the fallback cwd when no workspace was asked for', () => {
    const create = vi.fn();

    expect(resolveLaunchDir(managersWith(create), false, 'claude', '/project')).toEqual({
      cwd: '/project', workspaceDir: undefined, ready: undefined,
    });
    expect(create).not.toHaveBeenCalled();
  });

  // The clone's target directory is known synchronously, which is what lets the tab and its cwd be
  // set up before the clone has finished.
  it('reports a clone still in flight by its directory and its promise', () => {
    const ready = Promise.resolve();

    const dir = resolveLaunchDir(managersWith(() => ({ dir: '/workspace/claude', ready })), true, 'claude', '/project');

    expect(dir).toEqual({ cwd: '/workspace/claude', workspaceDir: '/workspace/claude', ready });
  });

  it('names the clone under the label it was given', () => {
    const create = vi.fn(() => ({ dir: '/workspace/bot', ready: Promise.resolve() }));

    resolveLaunchDir(managersWith(create), true, 'bot', '/project');

    expect(create).toHaveBeenCalledWith('bot');
  });

  // No repo, or a remote that cannot be read. Both fail before anything is cloned, so the caller
  // gets a string to surface rather than a directory to launch in.
  it('returns the error string when the workspace cannot be created', () => {
    const dir = resolveLaunchDir(managersWith(() => ({ error: 'No git remote named origin.' })), true, 'claude', '/project');

    expect(dir).toBe('No git remote named origin.');
  });
});
