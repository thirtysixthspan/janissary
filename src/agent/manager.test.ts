import { describe, expect, it, vi } from 'vitest';
import { createController } from '../controller.js';
import { tabRuntime } from '../tab/runtime.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import type { AgentSnapshot } from './types.js';

const snapshot: AgentSnapshot = Object.freeze({ taskPath: '/task.md', taskText: 'captured task', skills: [], grants: [] });

function setup() {
  const controller = createController({ emitState: () => {}, sendPty: () => {}, sendPtyExit: () => {} });
  const caller = seedRootTab(controller.managers.tab);
  const captured = controller.managers.agent.captureCaller(caller);
  return { controller, caller, captured, manager: controller.managers.agent };
}

describe('AgentRunManager', () => {
  it('gives concurrent runs distinct ids and independent snapshots and abort state', () => {
    const { manager, captured } = setup();
    const first = manager.create({ caller: captured, snapshot });
    const second = manager.create({ caller: captured, snapshot });

    expect(first.id).not.toBe(second.id);
    expect(first.snapshot).toBe(snapshot);
    expect(first.abortController).not.toBe(second.abortController);
    expect(manager.runs.size).toBe(2);
  });

  it('keeps the first completion, failure, or termination outcome and cleans once', async () => {
    const { manager, captured } = setup();
    const run = manager.create({ caller: captured, snapshot });
    const cleanup = vi.fn();
    run.addResource('resource-1', cleanup);

    const completed = manager.finish(run.id, 'completed');
    const failed = manager.finish(run.id, 'failed');
    await Promise.all([completed, failed]);

    expect(run.outcome).toBe('completed');
    expect(cleanup).toHaveBeenCalledOnce();
    expect(manager.runs).toHaveProperty('size', 0);
  });

  it('terminates runs when their captured caller closes, including the last tab', async () => {
    const { manager, captured, caller, controller } = setup();
    const run = manager.create({ caller: captured, snapshot });
    const released = vi.fn();
    run.addResource('process-1', released);

    manager.closeCaller(caller);
    await run.finish('terminated');
    expect(run.abortController.signal.aborted).toBe(true);
    expect(released).toHaveBeenCalledOnce();
    controller.shutdown();
  });

  it('does not terminate a run when its monitor detaches', async () => {
    const { manager, captured } = setup();
    const run = manager.create({ caller: captured, snapshot });
    manager.attachMonitor(run.id, 'monitor-1');
    manager.closeMonitor('monitor-1');

    expect(run.monitorIds.size).toBe(0);
    expect(run.outcome).toBeUndefined();
    expect(run.abortController.signal.aborted).toBe(false);
    await manager.finish(run.id, 'completed');
  });

  it('rejects stale or recycled caller incarnations before starting a run', () => {
    const { manager, captured, caller } = setup();
    tabRuntime(caller).incarnation = 'recycled-incarnation';

    expect(() => manager.create({ caller: captured, snapshot })).toThrow('Agent caller is stale: janus');
    expect(manager.runs.size).toBe(0);
  });

  it('disposes and rejects late resources while containing async disposer failures', async () => {
    const { manager, captured } = setup();
    const run = manager.create({ caller: captured, snapshot });
    const firstCleanup = vi.fn(() => { throw new Error('cleanup failed'); });
    const secondCleanup = vi.fn();
    run.addResource('first', firstCleanup);
    run.addResource('second', secondCleanup);
    await expect(manager.finish(run.id, 'terminated')).rejects.toThrow('Agent run');

    const lateCleanup = vi.fn(async () => { throw new Error('late cleanup failed'); });
    expect(() => run.addResource('late', lateCleanup)).toThrow('Agent run has already ended.');
    await Promise.resolve();

    expect(firstCleanup).toHaveBeenCalledOnce();
    expect(secondCleanup).toHaveBeenCalledOnce();
    expect(lateCleanup).toHaveBeenCalledOnce();
    await expect(run.finish('failed')).rejects.toMatchObject({
      errors: [expect.objectContaining({ message: 'cleanup failed' })],
    });
    expect(run.outcome).toBe('terminated');
    expect(manager.runs.has(run.id)).toBe(false);
  });

  it('acquires only tracked borrowed workspaces and releases its own lease', async () => {
    const { controller, manager, captured } = setup();
    const release = vi.fn(async () => {});
    const acquire = vi.fn((dir: string) => {
      if (dir !== '/tracked') throw new Error(`Cannot borrow untracked workspace: ${dir}`);
      return release;
    });
    Object.assign(controller.managers.workspace, { acquireAgentLease: acquire });

    expect(() => manager.create({ caller: captured, snapshot, workspaceDir: '/unknown' }))
      .toThrow('Cannot borrow untracked workspace: /unknown');
    const run = manager.create({ caller: captured, snapshot, workspaceDir: '/tracked' });
    await manager.finish(run.id, 'completed');

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledOnce();
    await controller.shutdown();
  });

  it('attempts cleanup for every active run when one cleanup fails during disposal', async () => {
    const { manager } = setup();
    const failed = manager.create({ caller: manager.captureCaller(manager['managers'].tab.cur()), snapshot });
    const completed = manager.create({ caller: manager.captureCaller(manager['managers'].tab.cur()), snapshot });
    const clean = vi.fn();
    failed.addResource('bad', () => { throw new Error('bad cleanup'); });
    completed.addResource('good', clean);

    await expect(manager.dispose()).rejects.toThrow('Agent run shutdown failed.');
    expect(clean).toHaveBeenCalledOnce();
    expect(manager.runs.size).toBe(0);
  });
});
