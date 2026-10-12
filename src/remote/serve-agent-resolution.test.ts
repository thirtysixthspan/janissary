import { describe, expect, it, vi } from 'vitest';
import { resolveRemoteAgentRequest } from './serve-agent-resolution.js';
import type { ServerFrame } from './protocol-frames.js';

describe('resolveRemoteAgentRequest', () => {
  it('resolves task content on the execution host', () => {
    const frames: ServerFrame[] = [];
    resolveRemoteAgentRequest({ type: 'agent-resolve', id: 'run-1', task: 'ai/tasks/feature/work-pull-request-issue.md', skills: [] },
      process.cwd(), (frame) => { frames.push(frame); });

    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      type: 'agent-resolve-result', id: 'run-1',
      snapshot: { taskText: expect.stringContaining('# Work a Pull Request Issue'), grants: [], skills: [] },
    });
  });

  it('returns task-resolution errors to the request instead of faulting the channel', () => {
    const emit = vi.fn();
    resolveRemoteAgentRequest({ type: 'agent-resolve', id: 'run-2', task: 'missing-task.md', skills: [] },
      process.cwd(), emit);

    expect(emit).toHaveBeenCalledWith({
      type: 'agent-resolve-result', id: 'run-2', error: 'Agent: unknown task "missing-task.md".',
    });
  });
});
