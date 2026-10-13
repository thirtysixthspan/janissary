import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as Workspace from './index.js';

const findRepoRootMock = vi.fn();
const getRemoteUrlMock = vi.fn();
const provisionWorkspaceMock = vi.fn();
const removeWorkspaceMock = vi.fn();
const removeWorkspaceStrictMock = vi.fn();

vi.mock('./index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Workspace>();
  return {
    ...actual,
    findRepoRoot: (...args: unknown[]) => findRepoRootMock(...args),
    getRemoteUrl: (...args: unknown[]) => getRemoteUrlMock(...args),
    provisionWorkspace: (...args: unknown[]) => provisionWorkspaceMock(...args),
    removeWorkspace: (...args: unknown[]) => removeWorkspaceMock(...args),
    removeWorkspaceStrict: (...args: unknown[]) => removeWorkspaceStrictMock(...args),
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
    removeWorkspaceStrictMock.mockReset();
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
    it('does not reject readiness when optional notice delivery fails', async () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      provisionWorkspaceMock.mockReturnValue({ ...handle('/repo/workspace'), oauthNotice: 'OAuth unavailable' });
      const result = new WorkspaceManager('/repo', () => { throw new Error('notification unavailable'); }).create('agent');
      if ('ready' in result) await expect(result.ready).resolves.toBeUndefined();
    });

    it('reports an optional OAuth notice after readiness without rejecting it', async () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      const ready = Promise.withResolvers<void>();
      provisionWorkspaceMock.mockReturnValue({ ...handle('/repo/workspace'), ready: ready.promise, oauthNotice: 'OAuth unavailable' });
      const report = vi.fn();
      const result = new WorkspaceManager('/repo', report).create('agent');
      expect(report).not.toHaveBeenCalled();
      ready.resolve();
      if ('ready' in result) await expect(result.ready).resolves.toBeUndefined();
      expect(report).toHaveBeenCalledExactlyOnceWith('agent', 'OAuth unavailable');
      expect(result).toMatchObject({ oauthNotice: 'OAuth unavailable' });
    });

    it('does not report a credential notice for a workspace already released', async () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      const ready = Promise.withResolvers<void>();
      provisionWorkspaceMock.mockReturnValue({ ...handle('/repo/workspace'), ready: ready.promise, oauthNotice: 'OAuth unavailable' });
      const report = vi.fn();
      const manager = new WorkspaceManager('/repo', report);
      const result = manager.create('agent');
      manager.release('/repo/workspace');
      ready.resolve();
      if ('ready' in result) await result.ready;
      expect(report).not.toHaveBeenCalled();
    });

    it.each(['resolve', 'reject'] as const)(
      'does not let an older attempt erase or cancel its replacement after it %ss', async (outcome) => {
        findRepoRootMock.mockReturnValue('/repo');
        getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
        const oldReady = Promise.withResolvers<void>();
        const newReady = Promise.withResolvers<void>();
        const oldCancel = vi.fn();
        const newCancel = vi.fn();
        const dir = '/repo/.janissary/workspace/agent';
        provisionWorkspaceMock
          .mockReturnValueOnce({ ...handle(dir, oldCancel), ready: oldReady.promise, oauthNotice: 'old notice' })
          .mockReturnValueOnce({ ...handle(dir, newCancel), ready: newReady.promise, oauthNotice: 'new notice' });
        const report = vi.fn();
        const manager = new WorkspaceManager('/repo', report);
        const oldAttempt = manager.create('agent');
        if (!('ready' in oldAttempt)) throw new Error('old attempt did not start');

        oldAttempt.cancel?.();
        manager.release(dir);
        const newAttempt = manager.create('agent');
        if (!('ready' in newAttempt)) throw new Error('new attempt did not start');
        oldAttempt.cancel?.();
        expect(newCancel).not.toHaveBeenCalled();

        if (outcome === 'resolve') {
          oldReady.resolve();
          await expect(oldAttempt.ready).resolves.toBeUndefined();
        } else {
          oldReady.reject(new Error('old clone failed'));
          await expect(oldAttempt.ready).rejects.toThrow('old clone failed');
        }

        expect(manager.provisioning(dir)).toBe(true);
        const borrowed = manager.acquireAgentWorkspace('agent');
        expect(borrowed?.ready).toBe(newAttempt.ready);
        await borrowed?.release();
        expect(report).not.toHaveBeenCalled();
        newAttempt.cancel?.();
        expect(newCancel).toHaveBeenCalledOnce();
        newReady.resolve();
        await newAttempt.ready;
        expect(report).not.toHaveBeenCalled();
      },
    );

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
    it('borrows a named tracked workspace without releasing its other holder', async () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      const dir = '/repo/.janissary/workspace/docs';
      provisionWorkspaceMock.mockReturnValue(handle(dir));
      const manager = new WorkspaceManager('/repo');
      manager.create('docs');

      const borrowed = manager.acquireAgentWorkspace('docs');
      expect(borrowed).toMatchObject({ dir });
      if (!borrowed) throw new Error('named workspace was not available');
      await borrowed.release();

      expect(removeWorkspaceStrictMock).not.toHaveBeenCalled();
      expect(manager.acquireAgentWorkspace('missing')).toBeUndefined();
      manager.release(dir);
      expect(removeWorkspaceMock).toHaveBeenCalledWith(dir);
    });

    it('waits for a named workspace provision and keeps it alive when its original holder closes', async () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      const dir = '/repo/.janissary/workspace/docs';
      const ready = Promise.withResolvers<void>();
      const cancel = vi.fn(() => ready.resolve());
      provisionWorkspaceMock.mockReturnValue({ ...handle(dir, cancel), ready: ready.promise });
      const manager = new WorkspaceManager('/repo');
      const created = manager.create('docs');
      const borrowed = manager.acquireAgentWorkspace('docs');
      if (!borrowed) throw new Error('named workspace was not available');

      manager.cancel('docs');
      manager.release(dir);
      expect(cancel).not.toHaveBeenCalled();
      expect(removeWorkspaceStrictMock).not.toHaveBeenCalled();

      ready.resolve();
      await borrowed.ready;
      await borrowed.release();

      expect(cancel).not.toHaveBeenCalled();
      expect(removeWorkspaceStrictMock).toHaveBeenCalledWith(dir);
      if ('ready' in created) await created.ready;
    });

    it('cancels an agent clone and removes it after its retained run reference is released', async () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      const ready = Promise.withResolvers<void>();
      const dir = '/repo/.janissary/workspace/agent-run';
      const cancel = vi.fn(() => ready.resolve());
      provisionWorkspaceMock.mockReturnValue({ ...handle(dir, cancel), ready: ready.promise });
      const manager = new WorkspaceManager();
      const created = manager.create('agent-run');
      if (!('ready' in created)) throw new Error('workspace was not created');
      const release = manager.acquireAgentLease(dir);
      manager.release(dir);

      manager.cancel('agent-run');
      await created.ready;
      await release();

      expect(cancel).toHaveBeenCalledOnce();
      expect(removeWorkspaceStrictMock).toHaveBeenCalledWith(dir);
    });

    it('acquires and releases a tracked headless workspace reference once', async () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      const dir = '/repo/.janissary/workspace/agent-1';
      provisionWorkspaceMock.mockReturnValue(handle(dir));
      const manager = new WorkspaceManager();
      manager.create('agent-1');

      const release = manager.acquireAgentLease(dir);
      manager.release(dir);
      await release();
      await release();

      expect(removeWorkspaceStrictMock).toHaveBeenCalledWith(dir);
      expect(removeWorkspaceStrictMock).toHaveBeenCalledTimes(1);
    });

    it('rejects an untracked headless workspace without acquiring it', () => {
      const manager = new WorkspaceManager();
      expect(() => manager.acquireAgentLease('/untracked')).toThrow('Cannot borrow untracked workspace: /untracked');
    });

    it('reports final headless workspace removal errors', async () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      const dir = '/repo/.janissary/workspace/agent-1';
      provisionWorkspaceMock.mockReturnValue(handle(dir));
      const manager = new WorkspaceManager();
      manager.create('agent-1');
      const release = manager.acquireAgentLease(dir);
      manager.release(dir);
      removeWorkspaceStrictMock.mockImplementation(() => { throw new Error('remove failed'); });

      await expect(release()).rejects.toThrow('remove failed');
    });

    it('keeps a failed final lease tracked until a retry removes it', async () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      const dir = '/repo/.janissary/workspace/agent-1';
      provisionWorkspaceMock.mockReturnValue(handle(dir));
      const manager = new WorkspaceManager();
      manager.create('agent-1');
      const release = manager.acquireAgentLease(dir);
      manager.release(dir);
      removeWorkspaceStrictMock.mockImplementationOnce(() => { throw new Error('remove failed'); });

      await expect(release()).rejects.toThrow('remove failed');
      const retainedRelease = manager.acquireAgentLease(dir);
      await retainedRelease();
      await release();
      await release();

      expect(removeWorkspaceStrictMock).toHaveBeenCalledTimes(2);
    });

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
