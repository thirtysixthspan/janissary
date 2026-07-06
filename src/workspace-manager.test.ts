import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as Workspace from './workspace.js';

const findRepoRootMock = vi.fn();
const createWorkspaceMock = vi.fn();
const removeWorkspaceMock = vi.fn();

vi.mock('./workspace.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Workspace>();
  return {
    ...actual,
    findRepoRoot: (...args: unknown[]) => findRepoRootMock(...args),
    createWorkspace: (...args: unknown[]) => createWorkspaceMock(...args),
    removeWorkspace: (...args: unknown[]) => removeWorkspaceMock(...args),
  };
});

const { WorkspaceManager } = await import('./workspace-manager.js');

describe('WorkspaceManager', () => {
  beforeEach(() => {
    findRepoRootMock.mockReset();
    createWorkspaceMock.mockReset();
    removeWorkspaceMock.mockReset();
  });

  describe('create', () => {
    it('returns an error when no repo is found', () => {
      findRepoRootMock.mockReturnValue(undefined);
      const manager = new WorkspaceManager();
      expect(manager.create('agent-1')).toEqual({
        error: 'No git repository found. Cannot create workspace.',
      });
      expect(createWorkspaceMock).not.toHaveBeenCalled();
    });

    it('creates and tracks a workspace directory', () => {
      findRepoRootMock.mockReturnValue('/repo');
      createWorkspaceMock.mockReturnValue('/repo/.janissary/workspace/agent-1');
      const manager = new WorkspaceManager();
      expect(manager.create('agent-1')).toEqual({ dir: '/repo/.janissary/workspace/agent-1' });
      expect(createWorkspaceMock).toHaveBeenCalledWith('agent-1', '/repo');
    });

    it('returns an error when the clone throws', () => {
      findRepoRootMock.mockReturnValue('/repo');
      createWorkspaceMock.mockImplementation(() => { throw new Error('clone failed'); });
      const manager = new WorkspaceManager();
      expect(manager.create('agent-1')).toEqual({
        error: 'Failed to create workspace: clone failed',
      });
    });

    it('stringifies a non-Error thrown value', () => {
      findRepoRootMock.mockReturnValue('/repo');
      createWorkspaceMock.mockImplementation(() => { throw 'boom'; });
      const manager = new WorkspaceManager();
      expect(manager.create('agent-1')).toEqual({
        error: 'Failed to create workspace: boom',
      });
    });
  });

  describe('remove', () => {
    it('removes a tracked workspace directory', () => {
      findRepoRootMock.mockReturnValue('/repo');
      createWorkspaceMock.mockReturnValue('/repo/.janissary/workspace/agent-1');
      const manager = new WorkspaceManager();
      manager.create('agent-1');
      manager.remove('/repo/.janissary/workspace/agent-1');
      expect(removeWorkspaceMock).toHaveBeenCalledWith('/repo/.janissary/workspace/agent-1');
    });
  });

  describe('removeAll', () => {
    it('removes every tracked workspace directory', () => {
      findRepoRootMock.mockReturnValue('/repo');
      createWorkspaceMock.mockReturnValueOnce('/repo/.janissary/workspace/a').mockReturnValueOnce('/repo/.janissary/workspace/b');
      const manager = new WorkspaceManager();
      manager.create('a');
      manager.create('b');
      manager.removeAll();
      expect(removeWorkspaceMock).toHaveBeenCalledWith('/repo/.janissary/workspace/a');
      expect(removeWorkspaceMock).toHaveBeenCalledWith('/repo/.janissary/workspace/b');
      expect(removeWorkspaceMock).toHaveBeenCalledTimes(2);
    });

    it('does nothing when no workspaces are tracked', () => {
      const manager = new WorkspaceManager();
      manager.removeAll();
      expect(removeWorkspaceMock).not.toHaveBeenCalled();
    });
  });
});
