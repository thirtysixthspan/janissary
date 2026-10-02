import { describe, it, expect, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { memberWorkspaceName, provisionMembers, releaseMembers } from './workspaces.js';
import type { MultiAgentMember } from './types.js';

type Workspace = { release: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };

function fakeWorkspace(): Workspace {
  return { release: vi.fn(), cancel: vi.fn() };
}

const managersWith = (workspace: Workspace) => ({ workspace }) as unknown as Managers;

const member = (model: string, index = 0): MultiAgentMember => ({ index, model, state: 'cloning' });

describe('memberWorkspaceName', () => {
  it('replaces the slashes of a model so the result is one folder name', () => {
    expect(memberWorkspaceName('multi-agent', 'google/gemini-3.1-flash-lite', 0))
      .toBe('multi-agent-google-gemini-3.1-flash-lite-0');
  });

  it('keeps a model with no slash whole', () => {
    expect(memberWorkspaceName('multi-agent', 'big-pickle', 1)).toBe('multi-agent-big-pickle-1');
  });

  it('gives two runs on different labels different names', () => {
    expect(memberWorkspaceName('multi-agent', 'm', 0)).not.toBe(memberWorkspaceName('multi-agent-2', 'm', 0));
  });

  it('gives two members of one run different names', () => {
    expect(memberWorkspaceName('multi-agent', 'm', 0)).not.toBe(memberWorkspaceName('multi-agent', 'm', 1));
  });

  // Folding `/` to `-` is not injective, and a project can override the catalog. Without the index
  // these two models would share one clone directory, and `WorkspaceManager` keys its tracking maps
  // by name — so the second `create` would overwrite the first's and both agents would write into
  // one working tree.
  it('keeps a slashed model and an unslashed one apart', () => {
    expect(memberWorkspaceName('multi-agent', 'a/b', 0)).not.toBe(memberWorkspaceName('multi-agent', 'a-b', 1));
  });
});

describe('provisionMembers', () => {
  it('starts one clone per member under a distinct name and reports each ready in turn', async () => {
    const workspace = fakeWorkspace();
    const create = vi.fn((name: string) => ({ dir: `/ws/${name}`, ready: Promise.resolve() }));
    const managers = { workspace: { ...workspace, create } } as unknown as Managers;
    const members = [member('opencode/a'), member('opencode/b', 1), member('google/gemini', 2)];
    const ready: string[] = [];

    provisionMembers('multi-agent', members, managers, (m) => { ready.push(m.model); });
    await Promise.all([Promise.resolve(), Promise.resolve(), Promise.resolve()]);

    expect(create.mock.calls.map(([name]) => name)).toEqual([
      'multi-agent-opencode-a-0',
      'multi-agent-opencode-b-1',
      'multi-agent-google-gemini-2',
    ]);
    expect(members.map((m) => m.dir)).toEqual(['/ws/multi-agent-opencode-a-0', '/ws/multi-agent-opencode-b-1', '/ws/multi-agent-google-gemini-2']);
    expect(ready).toEqual(['opencode/a', 'opencode/b', 'google/gemini']);
  });

  it('fails the member whose clone cannot start and provisions the rest', () => {
    const create = vi.fn((name: string) => (name.endsWith('-b-1') ? { error: 'no origin remote' } : { dir: `/ws/${name}`, ready: Promise.resolve() }));
    const managers = { workspace: { create } } as unknown as Managers;
    const members = [member('opencode/a'), member('opencode/b', 1)];

    provisionMembers('multi-agent', members, managers, vi.fn());

    expect(members[1].state).toBe('failed');
    expect(members[1].error).toBe('no origin remote');
    expect(members[0].state).toBe('cloning');
  });

  it('fails a member whose name cannot be one folder', () => {
    const create = vi.fn();
    const managers = { workspace: { create } } as unknown as Managers;
    // A model holding a backslash makes the derived name reach below another folder.
    const members = [member(String.raw`a\b`)];

    provisionMembers('multi-agent', members, managers, vi.fn());

    expect(create).not.toHaveBeenCalled();
    expect(members[0].state).toBe('failed');
  });

  it('never reports a member whose clone failed as ready', async () => {
    const create = vi.fn(() => ({ dir: '/ws/x', ready: Promise.reject(new Error('clone aborted')) }));
    const managers = { workspace: { create } } as unknown as Managers;
    const members = [member('opencode/a')];
    const onReady = vi.fn();

    provisionMembers('multi-agent', members, managers, onReady);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onReady).not.toHaveBeenCalled();
    expect(members[0].state).toBe('failed');
    expect(members[0].error).toBe('clone aborted');
  });
});

describe('releaseMembers', () => {
  it('cancels every in-flight clone and defers every release to a macrotask', async () => {
    const workspace = fakeWorkspace();
    const managers = managersWith(workspace);
    const members = [member('opencode/a'), member('opencode/b', 1)];
    members[0].dir = '/ws/a';
    members[1].dir = '/ws/b';

    releaseMembers('multi-agent', members, managers);

    expect(workspace.cancel).toHaveBeenCalledWith('multi-agent-opencode-a-0');
    expect(workspace.cancel).toHaveBeenCalledWith('multi-agent-opencode-b-1');
    expect(workspace.release).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(workspace.release).toHaveBeenCalledWith('/ws/a');
    expect(workspace.release).toHaveBeenCalledWith('/ws/b');
  });

  it('releases nothing for a member that never got a directory', async () => {
    const workspace = fakeWorkspace();

    releaseMembers('multi-agent', [member('opencode/a')], managersWith(workspace));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(workspace.release).not.toHaveBeenCalled();
  });
});
