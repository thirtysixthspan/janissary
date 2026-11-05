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
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'agent-record-feed-'));
  records = new AcpSessionRecords({ projectDir: root });
});
afterEach(() => { records.dispose(); rmSync(root, { recursive: true, force: true }); });

function runFixture() {
  const run = new AgentRun({ label: 'caller', incarnation: 'one', cwd: root, context: [] }, {
    taskPath: metadata.taskPath, taskText: 'Task', skills: [], grants: [],
  });
  run.record = new AgentRecordFeed(records, metadata, run.id);
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
    ['completed', 'exact\nanswer', 'Completed', 'exact\nanswer'],
    ['completed', '', 'Completed', ''],
    ['failed', 'exact error', 'Failed', 'exact error'],
    ['failed', undefined, 'Failed', 'Agent failed.'],
    ['terminated', 'late completion', 'Terminated', 'Agent terminated.'],
  ] as const)('settles %s once with %j', async (outcome, response, status, answer) => {
    const run = runFixture();
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
});
