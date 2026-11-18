import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AcpSessionRecords } from '../acp-records/manager.js';
import { AcpRecordStore } from '../acp-records/store.js';
import { AgentRecordFeed } from './record-feed.js';
import { AgentRun } from './run.js';
import { getConfig } from '../config.js';

let root: string;
let records: AcpSessionRecords;
const metadata = { model: 'provider/model', taskPath: 'ai/tasks/original.md', ownerLabel: 'caller', ownerName: 'Original caller' };
const subagentMetadata = { ...metadata, subagentRole: 'research' };
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'agent-record-feed-'));
  records = new AcpSessionRecords({ projectDir: root });
});
afterEach(() => { records.dispose(); rmSync(root, { recursive: true, force: true }); });

function runFixture(feedMetadata: typeof metadata | typeof subagentMetadata = metadata) {
  const run = new AgentRun({ label: 'caller', incarnation: 'one', cwd: root, context: [] }, {
    taskPath: metadata.taskPath, taskText: 'Task', skills: [], grants: [],
  });
  run.record = new AgentRecordFeed(records, feedMetadata, run.id);
  return run;
}

describe('agent run durable feed', () => {
  it('fixes first outcome even when a synchronous status listener attempts another finish', async () => {
    const run = runFixture();
    run.record!.prompt('task');
    run.setStatus('Cleaning up', 'answer');
    let reentrant: Promise<void> | undefined;
    run.subscribe(() => { reentrant = run.finish('terminated'); });
    const completed = run.finish('completed');
    expect(reentrant).toBe(completed);
    await completed;
    expect(records.window(run.recordId!)).toMatchObject({ status: 'Completed', blocks: [{ answer: 'answer' }] });
  });
  it('copies provenance and exposes a UUID distinct from the run linkage', async () => {
    const run = runFixture();
    run.setSnapshot({ taskPath: '/resolved/other.md', taskText: 'resolved', skills: [], grants: [] });
    expect(run.recordId).not.toBe(run.id);
    expect(records.window(run.recordId!)).toMatchObject({ title: 'Agent: original.md', source: { ...metadata, runId: run.id }, status: 'Running', blocks: [] });
    await run.finish('failed');
    expect(records.window(run.recordId!)).toMatchObject({ status: 'Failed', blocks: [] });
  });

  it.each([
    ['completed', 'exact\nanswer', 'Completed', 'exact\nanswer', false],
    ['completed', '', 'Completed', '', false],
    ['failed', 'exact error', 'Failed', 'exact error', false],
    ['failed', undefined, 'Failed', 'Agent failed.', false],
    ['terminated', 'late completion', 'Terminated', 'Agent terminated.', false],
    ['terminated', 'late completion', 'Terminated', 'Subagent terminated.', true],
    ['partial', 'partial answer', 'Partial', 'partial answer', false],
    ['partial', '', 'Partial', '', false],
  ] as const)('settles %s once with %j', async (outcome, response, status, answer, subagent) => {
    const run = runFixture(subagent ? subagentMetadata : metadata);
    run.record!.prompt('task\n\nskill instructions\nparameters ');
    run.reportActivity('thought', ' ');
    run.reportActivity('message', 'exact ');
    run.reportActivity('message', '\n');
    run.setStatus('Cleaning up', response);
    await run.finish(outcome);
    await run.finish('completed');
    run.reportActivity('tool', 'late');
    expect(records.window(run.recordId!)).toMatchObject({ status, blocks: [{
      prompt: 'task\n\nskill instructions\nparameters ', answer,
      entries: [{ kind: 'thought', text: ' ' }, { kind: 'message', text: 'exact \n' }],
    }] });
    expect(new AcpRecordStore({ projectDir: root }).read(run.recordId!)?.outcome).toBe(status);
  });

  it('retains all activity before monitor whitespace filtering and truncation', async () => {
    const run = runFixture();
    run.record!.prompt('task');
    run.reportActivity('message', ' ');
    const count = getConfig().transcriptMaxLines + 2;
    for (let index = 0; index < count; index += 1) run.reportActivity('tool', `step ${index}`);
    expect(run.view().activity).toHaveLength(getConfig().transcriptMaxLines);
    expect(records.window(run.recordId!)?.blocks[0].entries).toHaveLength(count + 1);
    await run.finish('completed');
  });

  it('closes the first outcome before rejecting cleanup and preserves its answer', async () => {
    const run = runFixture();
    run.record!.prompt('task');
    run.setStatus('Cleaning up', 'answer');
    run.addResource('broken', () => {
      expect(records.window(run.recordId!)?.status).toBe('Completed');
      throw new Error('cleanup failed');
    });
    await expect(run.finish('completed')).rejects.toThrow('cleanup failed');
    expect(records.window(run.recordId!)).toMatchObject({ status: 'Completed', blocks: [{ answer: 'answer' }] });
  });

  it('projects the subagent role onto the row and window source with the original task title', () => {
    const run = runFixture(subagentMetadata);
    run.setSnapshot({ taskPath: '/resolved/other.md', taskText: 'resolved', skills: [], grants: [] });
    expect(records.window(run.recordId!)).toMatchObject({
      title: 'Subagent: original.md',
      source: { ...subagentMetadata, kind: 'agent', runId: run.id },
    });
    expect(records.rows().find((row) => row.id === run.recordId)).toMatchObject({
      title: 'Subagent: original.md', subagentRole: 'research',
    });
  });

  it('reloads stored subagent provenance and keeps legacy records loadable without migration', () => {
    const subagent = runFixture(subagentMetadata);
    const legacy = runFixture();
    const coreId = records.begin({ kind: 'acp', model: 'model', ownerLabel: 'owner', ownerName: 'Owner' });
    const store = new AcpRecordStore({ projectDir: root });

    expect(store.read(subagent.recordId!)).toMatchObject({
      title: 'Subagent: original.md',
      source: { ...subagentMetadata, kind: 'agent', runId: subagent.id },
    });
    expect(store.read(legacy.recordId!)).toMatchObject({
      title: 'Agent: original.md',
      source: { ...metadata, kind: 'agent', runId: legacy.id },
    });
    expect(store.read(legacy.recordId!)?.source).not.toHaveProperty('subagentRole');
    expect(store.read(coreId)?.source).not.toHaveProperty('subagentRole');
  });

  it('fixes a first partial outcome even when a synchronous listener finishes again', async () => {
    const run = runFixture();
    run.record!.prompt('task');
    run.setStatus('Cleaning up', 'partial answer');
    let reentrant: Promise<void> | undefined;
    run.subscribe(() => { reentrant = run.finish('terminated'); });
    const partial = run.finish('partial');
    expect(reentrant).toBe(partial);
    await partial;
    expect(run.outcome).toBe('partial');
    expect(run.currentStatus).toBe('Partial');
    expect(records.window(run.recordId!)).toMatchObject({ status: 'Partial', blocks: [{ answer: 'partial answer' }] });
  });

  it('locks the terminal Partial status against later status changes', async () => {
    const run = runFixture();
    run.record!.prompt('task');
    await run.finish('partial');
    run.setStatus('Running', 'overwritten');
    expect(run.currentStatus).toBe('Partial');
    expect(run.view().response).toBeUndefined();
    expect(records.window(run.recordId!)).toMatchObject({ status: 'Partial' });
  });

  it('closes a partial record before rejecting cleanup and preserves its answer', async () => {
    const run = runFixture();
    run.record!.prompt('task');
    run.setStatus('Cleaning up', 'partial answer');
    run.addResource('broken', () => {
      expect(records.window(run.recordId!)?.status).toBe('Partial');
      throw new Error('cleanup failed');
    });
    await expect(run.finish('partial')).rejects.toThrow('cleanup failed');
    expect(records.window(run.recordId!)).toMatchObject({ status: 'Partial', blocks: [{ answer: 'partial answer' }] });
  });

  it('leaves a terminal header with no fabricated block when a subagent terminates before a prompt', async () => {
    const run = runFixture(subagentMetadata);
    await run.finish('terminated');
    expect(records.window(run.recordId!)).toMatchObject({ status: 'Terminated', blocks: [] });
  });
});
