import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createController, type Controller } from '../controller.js';
import { openNotificationsTab } from '../notifications/tab.js';
import { TabPluginHost } from '../plugins/host.js';
import { SystemShellManager } from '../system-shell.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';
import { AcpSessionRecords } from '../acp-records/manager.js';
import { ACP_RECORD_RETENTION_MS } from '../acp-records/model.js';
import { AcpRecordStore } from '../acp-records/store.js';
import type { AcpRecordSource } from '../acp-records/types.js';

// The external-open path shells out to the OS image viewer; stub it so tests never launch an app.
vi.mock('../openers/os-open.js', () => ({ didOsOpen: () => true }));
// Mock spawnPty so harness/tab creation never spawns real processes.
vi.mock('../pty.js');

const makeController = () => {
  const c = createController({ emitState: () => {}, sendPty: () => {}, sendPtyExit: () => {} });
  seedRootTab(c.managers.tab);
  return c;
};

const feedText = (c: Controller) =>
  c.view().find((t) => t.view === 'notifications')?.bufferLines.map((l) => l.text).join('\n') ?? '';

describe('createManagers question-pending wiring', () => {
  it('notifies when a question becomes pending for a background tab', () => {
    const c = makeController();
    c.dispatch('agent bob');
    openNotificationsTab(c.managers);
    c.setActiveTab(c.view().findIndex((t) => t.label === 'janus')); // janus active; bob is the background tab
    void c.managers.questions.register({ tab: 'bob', kind: 'ask', question: 'ok?' });
    expect(feedText(c)).toContain('Question from bob');
  });

  it('does not notify when the question is pending for the already-active tab', () => {
    const c = makeController();
    openNotificationsTab(c.managers);
    c.setActiveTab(c.view().findIndex((t) => t.label === 'janus'));
    void c.managers.questions.register({ tab: 'janus', kind: 'ask', question: 'ok?' });
    expect(feedText(c)).not.toContain('Question from janus');
  });
});

describe('createManagers plugin host wiring', () => {
  it('constructs the host before managers that consume plugin contributions', () => {
    const c = makeController();
    expect(c.managers.plugins).toBeInstanceOf(TabPluginHost);
    expect(c.managers.systemShell).toBeInstanceOf(SystemShellManager);
    expect(Object.keys(c.managers).indexOf('plugins'))
      .toBeLessThan(Object.keys(c.managers).indexOf('openFile'));
    expect(Object.keys(c.managers).indexOf('plugins'))
      .toBeLessThan(Object.keys(c.managers).indexOf('systemShell'));
    expect(Object.keys(c.managers).indexOf('pty'))
      .toBeLessThan(Object.keys(c.managers).indexOf('systemShell'));
    c.shutdown();
  });

  // `MANAGER_DISPOSE_ORDER` keeps this pair in the same relative position it held when teardown was
  // the reverse of construction order; the guarantee is the same, its source is not.
  it('disposes a plugin-contribution consumer before the plugin host', () => {
    const c = makeController();
    const disposed: string[] = [];
    Object.assign(c.managers.openFile, { dispose: () => { disposed.push('openFile'); } });
    Object.assign(c.managers.plugins, { dispose: () => { disposed.push('plugins'); } });

    c.shutdown();

    expect(disposed).toEqual(['openFile', 'plugins']);
  });
});

describe('createManagers durable ACP records', () => {
  let projectDir: string;
  let controllers: Controller[];
  const core: AcpRecordSource = { kind: 'acp', model: 'provider/model', ownerLabel: 'bob', ownerName: 'Bob' };
  const agent: AcpRecordSource = { ...core, kind: 'agent', runId: 'linked-run', taskPath: '/tasks/task.md' };
  const make = () => {
    const controller = createController({ emitState: () => {}, sendPty: () => {}, sendPtyExit: () => {} }, projectDir);
    controllers.push(controller);
    return controller;
  };
  beforeEach(() => {
    projectDir = mkdtempSync(path.join(tmpdir(), 'controller-acp-records-'));
    controllers = [];
  });
  afterEach(async () => {
    for (const controller of controllers) await controller.shutdown();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('registers the service before agent and ACP without creating storage or live records', () => {
    const controller = make();
    expect(controller.managers.acpRecords).toBeInstanceOf(AcpSessionRecords);
    const keys = Object.keys(controller.managers);
    expect(keys.indexOf('acpRecords')).toBeLessThan(keys.indexOf('agent'));
    expect(keys.indexOf('acpRecords')).toBeLessThan(keys.indexOf('acp'));
    expect(controller.managers.acpRecords.rows()).toEqual([]);
    expect(existsSync(path.join(projectDir, '.janissary', 'connections'))).toBe(false);
  });

  it('recovers a scratch-project crash with folded activity, metadata, saved history, and a 20-block window', () => {
    const first = make().managers.acpRecords;
    const started = Date.now();
    const coreId = first.begin(core);
    const agentId = first.begin(agent);
    first.prompt(coreId, 'first\nextra');
    first.activity(coreId, 'message', 'hello');
    first.activity(coreId, 'message', ' world');
    first.activity(coreId, 'thought', 'thinking');
    first.answer(coreId, 'answer');
    for (let index = 1; index < 21; index += 1) {
      first.prompt(coreId, `prompt ${index}`);
      first.answer(coreId, `answer ${index}`);
    }
    first.prompt(coreId, 'unsaved running prompt');
    first.prompt(agentId, 'unsaved task');
    const store = new AcpRecordStore({ projectDir });
    const durable = store.read(coreId)!;
    expect(durable).toMatchObject({ schemaVersion: 1, id: coreId, title: 'ACP: first', source: core });
    expect(durable.startedAt).toBeGreaterThanOrEqual(started);
    expect(durable.updatedAt).toBeGreaterThanOrEqual(durable.startedAt);
    expect(durable.blocks).toHaveLength(21);
    expect(durable.blocks[0]).toMatchObject({ prompt: 'first\nextra', answer: 'answer', entries: [
      { kind: 'message', text: 'hello world' }, { kind: 'thought', text: 'thinking' },
    ] });
    expect(store.read(agentId)).toMatchObject({ source: agent, blocks: [] });
    expect(new Set(readdirSync(path.join(projectDir, '.janissary', 'connections'))))
      .toEqual(new Set([`${coreId}.json`, `${agentId}.json`]));
    const recovered = make().managers.acpRecords;
    expect(recovered.window(coreId)).toMatchObject({ status: 'Closed', totalBlocks: 21, offset: 1, hasOlder: true });
    expect(recovered.window(coreId)?.blocks).toHaveLength(20);
    expect(recovered.window(coreId, 40)?.blocks[0].answer).toBe('answer');
    expect(recovered.window(agentId)).toMatchObject({ status: 'Terminated', runId: 'linked-run', totalBlocks: 0 });
    expect(store.read(coreId)?.outcome).toBe('Closed');
    expect(store.read(agentId)?.outcome).toBe('Terminated');
  });

  it('awaits shutdown persistence, supports closed deletion, and expires history on controller restart', async () => {
    const first = make();
    const id = first.managers.acpRecords.begin(core);
    const agentId = first.managers.acpRecords.begin(agent);
    first.managers.acpRecords.prompt(id, 'partial');
    first.managers.acpRecords.activity(id, 'tool', 'partial tool');
    await first.shutdown();
    const store = new AcpRecordStore({ projectDir });
    expect(store.read(id)).toMatchObject({ outcome: 'Closed', blocks: [{ prompt: 'partial', entries: [{ text: 'partial tool' }] }] });
    expect(store.read(agentId)?.outcome).toBe('Closed');
    const stale = store.read(id)!;
    const endedAt = Date.now() - ACP_RECORD_RETENTION_MS - 1000;
    store.write({ ...stale, startedAt: 0, updatedAt: endedAt, endedAt, blocks: [] });
    const next = make();
    expect(next.managers.acpRecords.window(id)).toBeUndefined();
    expect(existsSync(path.join(projectDir, '.janissary', 'connections', `${id}.json`))).toBe(false);
    expect(next.managers.acpRecords.window(agentId)?.status).toBe('Closed');
    expect(next.managers.acpRecords.delete(agentId)).toBe(true);
    await next.shutdown();
    expect(make().managers.acpRecords.rows()).toEqual([]);
  });
});
