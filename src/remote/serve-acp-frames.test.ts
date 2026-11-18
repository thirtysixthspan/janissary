import { describe, it, expect, vi } from 'vitest';
import { dispatchAcpFrame } from './serve-acp-frames.js';
import { decodeFrame, encodeFrame } from './protocol.js';
import type { RemoteFrame, ServerFrame } from './protocol-frames.js';
import type { ProvisionedWorkspace } from './serve-provision.js';

// Only the frame routing is under test here: `RemoteAcp` itself is exercised in its own tests, and
// the resolver against a real workspace is exercised in `serve-agent-resolution.test.ts`. These
// check that the extracted helper preserves each method, argument and refusal of the old switch.

function owner(dir = process.cwd()) {
  const acp = { open: vi.fn(), run: vi.fn(), toolResult: vi.fn(), close: vi.fn(), cancel: vi.fn() };
  return { acp, workspace: { dir, acp } as unknown as ProvisionedWorkspace };
}

const OPEN = { type: 'acp-open', id: 's1', command: 'opencode', args: ['acp'] } as const;
const RUN = { type: 'acp-run', id: 's1', text: 'hi', snapshot: { kind: 'core' } } as const;
const TOOL_RESULT = { type: 'acp-tool-result', id: 's1', request: 3, output: '42' } as const;
const CLOSE = { type: 'acp-close', id: 's1' } as const;
const CANCEL = { type: 'acp-cancel', id: 's1' } as const;
const RESOLVE = { type: 'agent-resolve', id: 'run-1', task: 'missing-task.md', skills: [] } as const;

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
});
