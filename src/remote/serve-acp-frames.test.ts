import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { dispatchAcpFrame } from './serve-acp-frames.js';
import { decodeFrame, encodeFrame } from './protocol.js';
import type { RemoteFrame, ServerFrame } from './protocol-frames.js';
import type { ProvisionedWorkspace } from './serve-provision.js';
import { RemoteRunClones } from './serve-run-clones.js';
import type { WorkspaceManager } from '../workspace/manager.js';

// Only the frame routing is under test here: `RemoteAcp` itself is exercised in its own tests, and
// the resolver against a real workspace is exercised in `serve-agent-resolution.test.ts`. These
// check that the extracted helper preserves each method, argument and refusal of the old switch.

function owner(dir = process.cwd()) {
  const acp = { open: vi.fn(), run: vi.fn(), toolResult: vi.fn(), close: vi.fn(), cancel: vi.fn() };
  const runClones = { create: vi.fn(), release: vi.fn(), lookup: vi.fn() };
  return { acp, runClones, workspace: { dir, acp, runClones } as unknown as ProvisionedWorkspace };
}

const OPEN = { type: 'acp-open', id: 's1', command: 'opencode', args: ['acp'] } as const;
const RUN = { type: 'acp-run', id: 's1', text: 'hi', snapshot: { kind: 'core' } } as const;
const TOOL_RESULT = { type: 'acp-tool-result', id: 's1', request: 3, output: '42' } as const;
const CLOSE = { type: 'acp-close', id: 's1' } as const;
const CANCEL = { type: 'acp-cancel', id: 's1' } as const;
const RESOLVE = { type: 'agent-resolve', id: 'run-1', task: 'missing-task.md', skills: [] } as const;
const CREATE = { type: 'run-clone', id: 'clone-1', action: 'create', label: 'subagent-run1' } as const;
const RELEASE = { type: 'run-clone', id: 'clone-2', action: 'release', label: 'subagent-run1' } as const;

const NO_WORKSPACE = { type: 'workspace-failed', message: 'No remote workspace has been provisioned.' } as const;

function asFrame(value: Parameters<typeof encodeFrame>[0]): RemoteFrame {
  const decoded = decodeFrame(encodeFrame(value));
  if (!('type' in decoded)) throw new Error(decoded.error);
  return decoded;
}

describe('dispatchAcpFrame', () => {
  it.each([
    ['acp-open', OPEN, (acp: ReturnType<typeof owner>['acp']) => acp.open],
    ['acp-run', RUN, (acp: ReturnType<typeof owner>['acp']) => acp.run],
    ['acp-tool-result', TOOL_RESULT, (acp: ReturnType<typeof owner>['acp']) => acp.toolResult],
  ])('delegates %s to the provisioned holder with the exact frame', (_name, frame, method) => {
    const { acp, workspace } = owner();
    const emit = vi.fn();

    expect(dispatchAcpFrame(frame, workspace, emit)).toBe(true);

    expect(method(acp)).toHaveBeenCalledExactlyOnceWith(frame);
    expect(emit).not.toHaveBeenCalled();
  });

  it('delegates acp-close and acp-cancel with the transport id, not the frame', () => {
    const { acp, workspace } = owner();
    const emit = vi.fn();

    expect(dispatchAcpFrame(CLOSE, workspace, emit)).toBe(true);
    expect(dispatchAcpFrame(CANCEL, workspace, emit)).toBe(true);

    expect(acp.close).toHaveBeenCalledExactlyOnceWith('s1');
    expect(acp.cancel).toHaveBeenCalledExactlyOnceWith('s1');
    expect(emit).not.toHaveBeenCalled();
  });

  it('resolves a task against the provisioned main directory', () => {
    const { workspace } = owner();
    const emit = vi.fn<(frame: ServerFrame) => void>();

    expect(dispatchAcpFrame({ ...RESOLVE, task: 'ai/tasks/feature/work-pull-request-issue.md' }, workspace, emit)).toBe(true);

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'agent-resolve-result', id: 'run-1',
      snapshot: expect.objectContaining({ taskText: expect.stringContaining('# Work a Pull Request Issue') }),
    }));
  });

  it('returns the resolver error on its result frame rather than faulting', () => {
    const { workspace } = owner();
    const emit = vi.fn();

    expect(dispatchAcpFrame(RESOLVE, workspace, emit)).toBe(true);

    expect(emit).toHaveBeenCalledWith({
      type: 'agent-resolve-result', id: 'run-1', error: 'Agent: unknown task "missing-task.md".',
    });
  });

  it('resolves a selected task through the provisioned owner clone lookup', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'frames-selected-'));
    try {
      const taskPath = path.join(root, 'ai', 'tasks', 'feature');
      mkdirSync(taskPath, { recursive: true });
      writeFileSync(path.join(taskPath, 'work-pull-request-issue.md'), '# Selected clone task');
      const { runClones, workspace } = owner();
      runClones.lookup.mockReturnValue(root);
      const emit = vi.fn<(frame: ServerFrame) => void>();

      expect(dispatchAcpFrame({
        ...RESOLVE, task: 'ai/tasks/feature/work-pull-request-issue.md', workspace: 'agent-run1',
      }, workspace, emit)).toBe(true);

      expect(runClones.lookup).toHaveBeenCalledExactlyOnceWith('agent-run1');
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent-resolve-result', id: 'run-1',
        snapshot: expect.objectContaining({ taskText: '# Selected clone task' }),
      }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the main directory and skips lookup when the selector is absent', () => {
    const { runClones, workspace } = owner();
    const emit = vi.fn<(frame: ServerFrame) => void>();

    expect(dispatchAcpFrame({
      ...RESOLVE, task: 'ai/tasks/feature/work-pull-request-issue.md',
    }, workspace, emit)).toBe(true);

    expect(runClones.lookup).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'agent-resolve-result', id: 'run-1',
      snapshot: expect.objectContaining({ taskText: expect.stringContaining('# Work a Pull Request Issue') }),
    }));
  });

  it('refuses a selected resolution with no workspace just like an unselected one', () => {
    const emit = vi.fn();

    expect(dispatchAcpFrame({ ...RESOLVE, workspace: 'agent-run1' }, undefined, emit)).toBe(true);

    expect(emit).toHaveBeenCalledExactlyOnceWith(NO_WORKSPACE);
  });

  it.each([OPEN, RUN, RESOLVE])('refuses %s with the missing-workspace message', (frame) => {
    const emit = vi.fn();

    expect(dispatchAcpFrame(frame, undefined, emit)).toBe(true);

    expect(emit).toHaveBeenCalledExactlyOnceWith(NO_WORKSPACE);
  });

  it.each([TOOL_RESULT, CLOSE, CANCEL])('silently ignores %s without a workspace', (frame) => {
    const emit = vi.fn();

    expect(dispatchAcpFrame(frame, undefined, emit)).toBe(true);

    expect(emit).not.toHaveBeenCalled();
  });

  it('accepts a successfully narrowed decodeFrame result as its RemoteFrame input', () => {
    const { acp, workspace } = owner();
    const emit = vi.fn();

    expect(dispatchAcpFrame(asFrame(OPEN), workspace, emit)).toBe(true);

    expect(acp.open).toHaveBeenCalledExactlyOnceWith(OPEN);
  });

  it.each([
    'acp-ready', 'acp-chunk', 'acp-turn', 'acp-tool-request', 'acp-tool-step',
    'acp-run-end', 'acp-activity', 'acp-closed', 'acp-error',
  ] as const)('ignores the server-only frame %s without side effects', (type) => {
    const { acp, workspace } = owner();
    const emit = vi.fn();
    const frame = { type, id: 's1' } as RemoteFrame;

    expect(dispatchAcpFrame(frame, workspace, emit)).toBe(false);

    expect(emit).not.toHaveBeenCalled();
    for (const call of Object.values(acp)) expect(call).not.toHaveBeenCalled();
  });

  it('ignores agent-resolve-result without side effects', () => {
    const { acp, workspace } = owner();
    const emit = vi.fn();
    const frame: RemoteFrame = { type: 'agent-resolve-result', id: 'run-1', error: 'no' };

    expect(dispatchAcpFrame(frame, workspace, emit)).toBe(false);

    expect(emit).not.toHaveBeenCalled();
    for (const call of Object.values(acp)) expect(call).not.toHaveBeenCalled();
  });

  it('ignores a non-ACP frame without side effects', () => {
    const { acp, workspace } = owner();
    const emit = vi.fn();
    const frame: RemoteFrame = { type: 'session-state' };

    expect(dispatchAcpFrame(frame, workspace, emit)).toBe(false);

    expect(emit).not.toHaveBeenCalled();
    for (const call of Object.values(acp)) expect(call).not.toHaveBeenCalled();
  });

  it.each([CREATE, RELEASE])('answers a %s without a workspace with a correlated error', (frame) => {
    const emit = vi.fn();

    expect(dispatchAcpFrame(frame, undefined, emit)).toBe(true);

    expect(emit).toHaveBeenCalledExactlyOnceWith({
      type: 'run-clone-result', id: frame.id, error: 'No remote workspace has been provisioned.',
    });
  });

  it.each([CREATE, RELEASE])('immediately claims a %s and passes only its label to the service', (frame) => {
    const { runClones, workspace } = owner();
    runClones.create.mockResolvedValue({ dir: '/srv/ws/subagent-run1' });
    runClones.release.mockResolvedValue({});
    const emit = vi.fn();

    expect(dispatchAcpFrame(frame, workspace, emit)).toBe(true);

    const method = frame.action === 'create' ? runClones.create : runClones.release;
    expect(method).toHaveBeenCalledExactlyOnceWith(frame.label);
  });

  it('defers a create answer until readiness and then sends the exact directory', async () => {
    const { runClones, workspace } = owner();
    const ready = Promise.withResolvers<{ dir?: string; error?: string }>();
    runClones.create.mockReturnValue(ready.promise);
    const emit = vi.fn();

    expect(dispatchAcpFrame(asFrame(CREATE), workspace, emit)).toBe(true);
    await Promise.resolve();
    expect(emit).not.toHaveBeenCalled();

    ready.resolve({ dir: '/srv/ws/subagent-run1' });
    await vi.waitFor(() => expect(emit).toHaveBeenCalledWith({
      type: 'run-clone-result', id: 'clone-1', dir: '/srv/ws/subagent-run1',
    }));
  });

  it.each([
    ['directory', 'create', { dir: '/srv/ws/subagent-run1' }],
    ['error', 'create', { error: 'clone refused' }],
    ['empty', 'release', {}],
  ] as const)('maps the service\'s exact %s result for %s to the request id', async (_kind, action, result) => {
    const { runClones, workspace } = owner();
    runClones.create.mockResolvedValue(result);
    runClones.release.mockResolvedValue(result);
    const emit = vi.fn();
    const frame = action === 'create' ? CREATE : { ...RELEASE, id: 'clone-1' };

    expect(dispatchAcpFrame(frame, workspace, emit)).toBe(true);
    await vi.waitFor(() => expect(emit).toHaveBeenCalledExactlyOnceWith({
      type: 'run-clone-result', id: 'clone-1', ...result,
    }));
  });

  it('correlates a release answered while a create is still pending', async () => {
    const { runClones, workspace } = owner();
    const ready = Promise.withResolvers<{ dir?: string; error?: string }>();
    runClones.create.mockReturnValue(ready.promise);
    runClones.release.mockResolvedValue({});
    const emit = vi.fn();

    expect(dispatchAcpFrame(CREATE, workspace, emit)).toBe(true);
    expect(dispatchAcpFrame(RELEASE, workspace, emit)).toBe(true);
    await vi.waitFor(() => expect(emit).toHaveBeenCalledExactlyOnceWith({ type: 'run-clone-result', id: 'clone-2' }));

    ready.resolve({ dir: '/srv/ws/subagent-run1' });
    await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(2));
    expect(emit).toHaveBeenCalledWith({ type: 'run-clone-result', id: 'clone-1', dir: '/srv/ws/subagent-run1' });
  });

  it('correlates two independent creates', async () => {
    const { runClones, workspace } = owner();
    runClones.create.mockResolvedValueOnce({ dir: '/srv/ws/one' }).mockResolvedValueOnce({ dir: '/srv/ws/two' });
    const emit = vi.fn();

    dispatchAcpFrame(CREATE, workspace, emit);
    dispatchAcpFrame({ ...CREATE, id: 'clone-3', label: 'subagent-run2' }, workspace, emit);

    await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(2));
    expect(emit).toHaveBeenCalledWith({ type: 'run-clone-result', id: 'clone-1', dir: '/srv/ws/one' });
    expect(emit).toHaveBeenCalledWith({ type: 'run-clone-result', id: 'clone-3', dir: '/srv/ws/two' });
  });

  it('falls back to an action-specific message when a service failure has no text', async () => {
    const { runClones, workspace } = owner();
    runClones.create.mockResolvedValue({ error: '' });
    const emit = vi.fn();

    dispatchAcpFrame(CREATE, workspace, emit);

    await vi.waitFor(() => expect(emit).toHaveBeenCalledWith({
      type: 'run-clone-result', id: 'clone-1', error: 'Remote run clone create failed.',
    }));
  });

  it('converts a synchronous service throw into a correlated error', async () => {
    const { runClones, workspace } = owner();
    runClones.create.mockImplementation(() => { throw new Error('manager exploded'); });
    const emit = vi.fn();

    expect(dispatchAcpFrame(CREATE, workspace, emit)).toBe(true);

    await vi.waitFor(() => expect(emit).toHaveBeenCalledWith({
      type: 'run-clone-result', id: 'clone-1', error: 'manager exploded',
    }));
  });

  it.each([
    ['error object', () => new Error('clone failed asynchronously'), 'clone failed asynchronously'],
    ['empty error object', () => {
      const error = new Error('placeholder');
      error.message = '';
      return error;
    }, 'Remote run clone create failed.'],
    ['non-error', () => 'plain failure', 'plain failure'],
  ])('converts a rejected service promise (%s) into a correlated error', async (_kind, thrown, message) => {
    const { runClones, workspace } = owner();
    runClones.create.mockReturnValue(Promise.reject(thrown()) as ReturnType<typeof runClones.create>);
    const emit = vi.fn();

    dispatchAcpFrame(CREATE, workspace, emit);

    await vi.waitFor(() => expect(emit).toHaveBeenCalledWith({ type: 'run-clone-result', id: 'clone-1', error: message }));
  });

  it('reaches the real service refusal for an invalid label without manager work', async () => {
    const create = vi.fn();
    const manager = { create, tracks: vi.fn(), remove: vi.fn() } as unknown as WorkspaceManager;
    const service = new RemoteRunClones(manager, {}, 'main');
    const workspace = { dir: process.cwd(), runClones: service } as unknown as ProvisionedWorkspace;
    const emit = vi.fn();

    expect(dispatchAcpFrame({ ...CREATE, label: '../escape' }, workspace, emit)).toBe(true);

    await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(1));
    expect(emit).toHaveBeenCalledWith({
      type: 'run-clone-result', id: 'clone-1', error: expect.stringContaining('Cannot launch'),
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects malformed action and label syntax by decoding before dispatch', () => {
    expect(decodeFrame(JSON.stringify({ ...CREATE, action: 'delete' }))).toEqual({
      error: 'Malformed remote frame "run-clone".',
    });
    expect(decodeFrame(JSON.stringify({ ...CREATE, label: '' }))).toEqual({
      error: 'Malformed remote frame "run-clone".',
    });
  });

  it('returns false for a decoded server-only run-clone-result without service calls', () => {
    const { acp, runClones, workspace } = owner();
    const emit = vi.fn();
    const frame = asFrame({ type: 'run-clone-result', id: 'clone-1' });

    expect(dispatchAcpFrame(frame, workspace, emit)).toBe(false);

    expect(emit).not.toHaveBeenCalled();
    expect(runClones.create).not.toHaveBeenCalled();
    expect(runClones.release).not.toHaveBeenCalled();
    for (const call of Object.values(acp)) expect(call).not.toHaveBeenCalled();
  });
});
