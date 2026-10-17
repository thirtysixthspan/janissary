import { describe, expect, it, vi } from 'vitest';
import { command } from './harness.js';
import type { CommandInvocationContext } from './types.js';
import type { Managers } from '../managers.js';

function setup(): { managers: Managers; run: ReturnType<typeof vi.fn> } {
  const run = vi.fn();
  const managers = {
    harness: { run, openLaunchDialog: vi.fn() },
    tab: { appendForInvocation: vi.fn(), append: vi.fn() },
  } as unknown as Managers;
  return { managers, run };
}

function invocation(
  systemSchedule?: CommandInvocationContext['systemSchedule'], label = 'creator',
): CommandInvocationContext {
  return {
    runId: 'run', invocationId: 'invocation',
    caller: { label, cwd: '/captured/cwd', context: [] },
    signal: new AbortController().signal,
    ...(systemSchedule && { systemSchedule }),
  };
}

describe('harness command invocation', () => {
  it('forwards system-schedule provenance to the harness manager', () => {
    const { managers, run } = setup();
    const context = invocation({ kind: 'system-schedule', scheduleKey: 'schedule-key' });

    command.run('harness claude', { label: 'creator', index: 0 }, managers, context);

    expect(run).toHaveBeenCalledWith('harness claude', context);
  });

  it('does not pass ordinary dispatch context as schedule naming authority', () => {
    const { managers, run } = setup();

    command.run('harness claude', { label: 'system', index: 0 }, managers, invocation(undefined, 'system'));

    expect(run).toHaveBeenCalledWith('harness claude');
  });
});
