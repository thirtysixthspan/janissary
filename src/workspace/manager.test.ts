import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as Workspace from './index.js';

const findRepoRootMock = vi.fn();
const getRemoteUrlMock = vi.fn();
const provisionWorkspaceMock = vi.fn();
const removeWorkspaceMock = vi.fn();

vi.mock('./index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Workspace>();
  return {
    ...actual,
    findRepoRoot: (...args: unknown[]) => findRepoRootMock(...args),
    getRemoteUrl: (...args: unknown[]) => getRemoteUrlMock(...args),
    provisionWorkspace: (...args: unknown[]) => provisionWorkspaceMock(...args),
    removeWorkspace: (...args: unknown[]) => removeWorkspaceMock(...args),
  };
});

const { WorkspaceManager } = await import('./manager.js');
const { messageBus } = await import('../bus.js');

function handle(dir: string, cancel: () => void = vi.fn()): { dir: string; ready: Promise<void>; cancel: () => void } {
  return { dir, ready: Promise.resolve(), cancel };
}

describe('WorkspaceManager', () => {
  beforeEach(() => {
    findRepoRootMock.mockReset();
    getRemoteUrlMock.mockReset();
    provisionWorkspaceMock.mockReset();
    removeWorkspaceMock.mockReset();
  });

  describe('preflight', () => {
    it('is undefined for a repo with an origin remote, and starts no clone', () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      expect(new WorkspaceManager().preflight()).toBeUndefined();
      expect(provisionWorkspaceMock).not.toHaveBeenCalled();
    });

    it('returns the error create would for a missing repo', () => {
      findRepoRootMock.mockReturnValue(undefined);
      expect(new WorkspaceManager().preflight()).toBe('No git repository found. Cannot create workspace.');
    });

    it('returns the error create would for a missing origin remote', () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockImplementation(() => { throw new Error('no origin remote'); });
      expect(new WorkspaceManager().preflight()).toBe('Failed to create workspace: no origin remote');
      expect(provisionWorkspaceMock).not.toHaveBeenCalled();
    });
  });

  describe('origin', () => {
    it('returns the project root\'s origin url', () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('git@github.com:owner/repo.git');
      expect(new WorkspaceManager().origin()).toBe('git@github.com:owner/repo.git');
    });

    it('is undefined without a repository', () => {
      findRepoRootMock.mockReturnValue(undefined);
      expect(new WorkspaceManager().origin()).toBeUndefined();
    });

    it('is undefined without an origin remote', () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockImplementation(() => { throw new Error('no origin remote'); });
      expect(new WorkspaceManager().origin()).toBeUndefined();
    });
  });

  describe('create', () => {
    it('returns an error when no repo is found', () => {
      findRepoRootMock.mockReturnValue(undefined);
      const manager = new WorkspaceManager();
      expect(manager.create('agent-1')).toEqual({
        error: 'No git repository found. Cannot create workspace.',
      });
      expect(provisionWorkspaceMock).not.toHaveBeenCalled();
    });

    it('returns the target directory synchronously, before the clone resolves', () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      provisionWorkspaceMock.mockReturnValue(handle('/repo/.janissary/workspace/agent-1'));
      const manager = new WorkspaceManager();
      const result = manager.create('agent-1');
      expect(result).toMatchObject({ dir: '/repo/.janissary/workspace/agent-1' });
      expect(provisionWorkspaceMock).toHaveBeenCalledWith('agent-1', 'https://example.com/repo.git', undefined);
    });

    it('passes a forwarded GitHub token through to the clone', () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://github.com/owner/repo.git');
      provisionWorkspaceMock.mockReturnValue(handle('/repo/.janissary/workspace/agent-1'));
      new WorkspaceManager().create('agent-1', 'ghp_forwarded');
      expect(provisionWorkspaceMock).toHaveBeenCalledWith('agent-1', 'https://github.com/owner/repo.git', 'ghp_forwarded');
    });

    it('returns an error when reading the remote throws', () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockImplementation(() => { throw new Error('no origin remote'); });
      const manager = new WorkspaceManager();
      expect(manager.create('agent-1')).toEqual({
        error: 'Failed to create workspace: no origin remote',
      });
      expect(provisionWorkspaceMock).not.toHaveBeenCalled();
    });

    it('stringifies a non-Error thrown value', () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockImplementation(() => { throw 'boom'; });
      const manager = new WorkspaceManager();
      expect(manager.create('agent-1')).toEqual({
        error: 'Failed to create workspace: boom',
      });
    });
  });

  describe('cancel', () => {
    it('kills an in-flight clone', () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      const cancel = vi.fn();
      provisionWorkspaceMock.mockReturnValue(handle('/repo/.janissary/workspace/agent-1', cancel));
      const manager = new WorkspaceManager();
      manager.create('agent-1');
      manager.cancel('agent-1');
      expect(cancel).toHaveBeenCalled();
    });

    it('is a no-op when nothing is pending for that name', () => {
      const manager = new WorkspaceManager();
      expect(() => manager.cancel('nothing-pending')).not.toThrow();
    });

    it('lets a retained clone finish when its creator closes during provisioning', () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      const cancel = vi.fn();
      const dir = '/repo/.janissary/workspace/agent-1';
      provisionWorkspaceMock.mockReturnValue(handle(dir, cancel));
      const manager = new WorkspaceManager();
      manager.create('agent-1');
      manager.retain(dir);
      manager.cancel('agent-1');
      expect(cancel).not.toHaveBeenCalled();
    });
  });

  describe('provisioning', () => {
    const dir = '/repo/.janissary/workspace/agent-1';

    function startClone(ready: Promise<void>): InstanceType<typeof WorkspaceManager> {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      provisionWorkspaceMock.mockReturnValue({ dir, ready, cancel: vi.fn() });
      return new WorkspaceManager();
    }

    it('is true while the clone into that directory is in flight, and false once it lands', async () => {
      const clone = Promise.withResolvers<void>();
      const manager = startClone(clone.promise);
      const result = manager.create('agent-1');
      expect(manager.provisioning(dir)).toBe(true);
      expect(manager.provisioning('/elsewhere')).toBe(false);
      clone.resolve();
      if ('ready' in result) await result.ready;
      expect(manager.provisioning(dir)).toBe(false);
    });

    it('is false once the clone fails', async () => {
      const manager = startClone(Promise.reject(new Error('clone failed')));
      const result = manager.create('agent-1');
      if ('ready' in result) await expect(result.ready).rejects.toThrow('clone failed');
      expect(manager.provisioning(dir)).toBe(false);
    });

    // A tab that joined the clone has no callback of its own, so the settlement itself must
    // rebroadcast, or that tab's indicator spins on after its creator closed.
    it('rebroadcasts state once a clone lands, after it has left the in-flight set', async () => {
      const clone = Promise.withResolvers<void>();
      const manager = startClone(clone.promise);
      const result = manager.create('agent-1');
      const seenProvisioning: boolean[] = [];
      const emitSpy = vi.spyOn(messageBus, 'emit').mockImplementation(() => { seenProvisioning.push(manager.provisioning(dir)); });
      clone.resolve();
      if ('ready' in result) await result.ready;
      expect(emitSpy).toHaveBeenCalledWith('state', { type: 'dirty' });
      expect(seenProvisioning).toEqual([false]);
      emitSpy.mockRestore();
    });

    it('rebroadcasts state once a clone fails', async () => {
      const manager = startClone(Promise.reject(new Error('clone failed')));
      const emitSpy = vi.spyOn(messageBus, 'emit');
      const result = manager.create('agent-1');
      if ('ready' in result) await expect(result.ready).rejects.toThrow('clone failed');
      expect(emitSpy).toHaveBeenCalledWith('state', { type: 'dirty' });
      emitSpy.mockRestore();
    });
  });

  describe('references', () => {
    it('keeps a retained workspace until the last release', () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      provisionWorkspaceMock.mockReturnValue(handle('/repo/.janissary/workspace/agent-1'));
      const manager = new WorkspaceManager();
      manager.create('agent-1');
      manager.retain('/repo/.janissary/workspace/agent-1');
      manager.release('/repo/.janissary/workspace/agent-1');
      expect(removeWorkspaceMock).not.toHaveBeenCalled();
      manager.release('/repo/.janissary/workspace/agent-1');
      expect(removeWorkspaceMock).toHaveBeenCalledWith('/repo/.janissary/workspace/agent-1');
    });

    it('does nothing when releasing an untracked directory', () => {
      const manager = new WorkspaceManager();
      manager.release('/repo/.janissary/workspace/missing');
      expect(removeWorkspaceMock).not.toHaveBeenCalled();
    });
  });

  describe('removeAll', () => {
    it('removes every tracked workspace directory', () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      provisionWorkspaceMock
        .mockReturnValueOnce(handle('/repo/.janissary/workspace/a'))
        .mockReturnValueOnce(handle('/repo/.janissary/workspace/b'));
      const manager = new WorkspaceManager();
      manager.create('a');
      manager.create('b');
      manager.removeAll();
      expect(removeWorkspaceMock).toHaveBeenCalledWith('/repo/.janissary/workspace/a');
      expect(removeWorkspaceMock).toHaveBeenCalledWith('/repo/.janissary/workspace/b');
      expect(removeWorkspaceMock).toHaveBeenCalledTimes(2);
    });

    it('cancels every in-flight clone first', () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      const cancelA = vi.fn();
      const cancelB = vi.fn();
      provisionWorkspaceMock
        .mockReturnValueOnce(handle('/repo/.janissary/workspace/a', cancelA))
        .mockReturnValueOnce(handle('/repo/.janissary/workspace/b', cancelB));
      const manager = new WorkspaceManager();
      manager.create('a');
      manager.create('b');
      manager.removeAll();
      expect(cancelA).toHaveBeenCalled();
      expect(cancelB).toHaveBeenCalled();
    });

    it('removes a multiply retained workspace once', () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      provisionWorkspaceMock.mockReturnValue(handle('/repo/.janissary/workspace/a'));
      const manager = new WorkspaceManager();
      manager.create('a');
      manager.retain('/repo/.janissary/workspace/a');
      manager.removeAll();
      expect(removeWorkspaceMock).toHaveBeenCalledWith('/repo/.janissary/workspace/a');
      expect(removeWorkspaceMock).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no workspaces are tracked', () => {
      const manager = new WorkspaceManager();
      manager.removeAll();
      expect(removeWorkspaceMock).not.toHaveBeenCalled();
    });
  });
});
