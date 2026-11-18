import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initWorkspaceDir, workspacePath } from '../workspace/index.js';
import { createControllerTestProject } from '../controller/test-project.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import type { AgentCaller } from './run.js';
import { startLocalAgentRun } from './workspace-execution.js';

const project = createControllerTestProject();
let scratch: string;
let controller: ReturnType<typeof project.create>;
let captured: AgentCaller;
let provisioning: ReturnType<typeof Promise.withResolvers<void>>;
let create: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), 'workspace-execution-'));
  initWorkspaceDir(scratch, path.join(scratch, '.claude.json'));
  controller = project.create();
  captured = controller.managers.agent.captureCaller(seedRootTab(controller.managers.tab));
  provisioning = Promise.withResolvers<void>();
  create = vi.spyOn(controller.managers.workspace, 'create').mockImplementation((name: string) => ({
    dir: workspacePath(name), ready: provisioning.promise, cancel: () => provisioning.resolve(),
  }));
});

afterEach(async () => {
  provisioning.resolve();
  await project.dispose();
  rmSync(scratch, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function fresh(options: { workspaceName?: string; subagentRole?: string } = {}) {
  return startLocalAgentRun(
    controller.managers, captured, 'agent execute task.md', 'task.md', undefined, undefined,
    { fresh: true, ...options },
  );
}

describe('startLocalAgentRun fresh mode', () => {
  it('returns the run and its durable record synchronously', () => {
    const result = fresh({ subagentRole: 'Research' });
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.run.recordId).toBeDefined();
    expect(controller.managers.acpRecords.rows()).toHaveLength(1);
    expect(controller.managers.acpRecords.window(result.run.recordId!)).toMatchObject({
      status: 'Running', subagentRole: 'Research', source: { taskPath: 'task.md', subagentRole: 'Research' },
    });
  });

  it('clones only after creation, with the existing record, selector, role and predetermined location', async () => {
    let seen: { count: number; source: unknown; role: unknown; dir: string; name: string } | undefined;
    create.mockImplementation((name: string) => {
      const rows = controller.managers.acpRecords.rows();
      const row = rows[0];
      seen = {
        count: rows.length,
        source: row ? controller.managers.acpRecords.window(row.id)?.source : undefined,
        role: row?.subagentRole,
        dir: workspacePath(name), name,
      };
      return { dir: workspacePath(name), ready: provisioning.promise, cancel: () => provisioning.resolve() };
    });
    const result = fresh({ subagentRole: 'Research' });
    expect(create).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(seen).toBeDefined();
    expect(seen!.count).toBe(1);
    expect(seen!.source).toMatchObject({ taskPath: 'task.md', subagentRole: 'Research' });
    expect(seen!.role).toBe('Research');
    expect(seen!.dir).toBe(result.workspace.dir);
    expect(result.run.executionDir).toBe(result.workspace.dir);
    expect(seen!.name).toMatch(/^agent-/);
  });

  it('schedules no clone before the result returns', () => {
    fresh();
    expect(create).not.toHaveBeenCalled();
  });

  it('skips both borrow mechanisms from a tracked caller even with a named selector', async () => {
    const callerDir = captured.cwd;
    controller.managers.workspace.retain(callerDir);
    const lease = vi.spyOn(controller.managers.workspace, 'acquireAgentLease');
    const named = vi.spyOn(controller.managers.workspace, 'acquireAgentWorkspace').mockReturnValue(undefined);

    const result = fresh({ workspaceName: 'docs' });
    await Promise.resolve();

    expect(lease).not.toHaveBeenCalledWith(callerDir);
    expect(named).not.toHaveBeenCalled();
    expect(result.workspace.dir).not.toBe(callerDir);
  });

  it('gives concurrent fresh runs distinct directories', () => {
    const first = fresh();
    const second = fresh();
    expect(first.workspace.dir).not.toBe(second.workspace.dir);
    expect(first.run.id).not.toBe(second.run.id);
  });

  it('starts no clone when manager creation rejects', async () => {
    vi.spyOn(controller.managers.agent, 'create').mockImplementation(() => { throw new Error('stale caller'); });
    expect(() => fresh({ subagentRole: 'Research' })).toThrow('stale caller');
    await Promise.resolve();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('startLocalAgentRun ordinary mode', () => {
  it('returns a Promise and omits subagent role metadata', async () => {
    vi.spyOn(controller.managers.workspace, 'acquireAgentLease').mockReturnValue(vi.fn(async () => {}));
    const result = startLocalAgentRun(
      controller.managers, captured, 'agent execute task.md', 'task.md', undefined, undefined, {},
    );
    expect(result).toBeInstanceOf(Promise);
    const { run } = await result;
    const row = controller.managers.acpRecords.window(run.recordId!)!;
    expect(row).not.toHaveProperty('subagentRole');
    expect(row.source).not.toHaveProperty('subagentRole');
  });
});
