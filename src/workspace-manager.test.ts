import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as Workspace from './workspace.js';

const findRepoRootMock = vi.fn();
const getRemoteUrlMock = vi.fn();
const provisionWorkspaceMock = vi.fn();
const removeWorkspaceMock = vi.fn();

vi.mock('./workspace.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Workspace>();
  return {
    ...actual,
    findRepoRoot: (...args: unknown[]) => findRepoRootMock(...args),
    getRemoteUrl: (...args: unknown[]) => getRemoteUrlMock(...args),
    provisionWorkspace: (...args: unknown[]) => provisionWorkspaceMock(...args),
    removeWorkspace: (...args: unknown[]) => removeWorkspaceMock(...args),
  };
});

const { WorkspaceManager } = await import('./workspace-manager.js');

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
      expect(provisionWorkspaceMock).toHaveBeenCalledWith('agent-1', 'https://example.com/repo.git');
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
  });

  describe('remove', () => {
    it('removes a tracked workspace directory', () => {
      findRepoRootMock.mockReturnValue('/repo');
      getRemoteUrlMock.mockReturnValue('https://example.com/repo.git');
      provisionWorkspaceMock.mockReturnValue(handle('/repo/.janissary/workspace/agent-1'));
      const manager = new WorkspaceManager();
      manager.create('agent-1');
      manager.remove('/repo/.janissary/workspace/agent-1');
      expect(removeWorkspaceMock).toHaveBeenCalledWith('/repo/.janissary/workspace/agent-1');
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

    it('does nothing when no workspaces are tracked', () => {
      const manager = new WorkspaceManager();
      manager.removeAll();
      expect(removeWorkspaceMock).not.toHaveBeenCalled();
    });
  });
});
