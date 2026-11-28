import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loopbackReachable } from '../http-test-fixture.js';
import type { Managers } from '../managers.js';
import { deliverNotification } from '../notifications/deliver.js';
import { QUESTION_CANCELLED, Questions } from '../questions.js';
import type { Tab } from '../tab/types.js';
import { McpManager, type McpLaunch } from './manager.js';

vi.mock('../notifications/deliver.js', () => ({ deliverNotification: vi.fn() }));

const canReachLoopback = await loopbackReachable();
const TAB = 'build';

function fixtureManagers(questions: Questions): Managers {
  const tab = { label: TAB, dotColor: '#fff' } as Tab;
  return {
    tab: {
      tabs: [tab],
      cur: () => tab,
      byLabel: (label: string) => label === TAB ? tab : undefined,
    },
    questions,
  } as unknown as Managers;
}

async function sendApprovalQuestion(launch: McpLaunch, id: number, question: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(launch.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${launch.token}`,
      accept: 'application/json, text/event-stream',
      connection: 'close',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id, method: 'tools/call',
      params: { name: 'question', arguments: { tab: TAB, kind: 'approve', question, options: ['Yes', 'No'] } },
    }),
    signal,
  });
  expect(response.status).toBe(200);
  const body = await response.text();
  const data = body.split('\n').find((line) => line.startsWith('data: '));
  if (!data) throw new Error('expected a JSON-RPC response');
  return JSON.parse(data.slice('data: '.length));
}

function expectedReply(id: number, text: string) {
  return { jsonrpc: '2.0', id, result: { isError: false, content: [{ type: 'text', text }] } };
}

describe.skipIf(!canReachLoopback)('McpManager question calls over HTTP', () => {
  let root: string;
  let manager: McpManager;
  let questions: Questions;
  let launch: McpLaunch;
  let calls: { controller: AbortController; reply: Promise<unknown> }[];

  beforeEach(async () => {
    vi.mocked(deliverNotification).mockClear();
    root = mkdtempSync(path.join(tmpdir(), 'janus-mcp-http-'));
    questions = new Questions();
    calls = [];
    manager = new McpManager(fixtureManagers(questions), root);
    await manager.ready;
    const available = manager.localLaunch();
    if (!available) throw new Error('expected a running MCP listener');
    launch = available;
  });

  afterEach(async () => {
    for (const { controller } of calls) controller.abort();
    questions.dispose();
    manager.dispose();
    await Promise.allSettled(calls.map(({ reply }) => reply));
    rmSync(root, { recursive: true, force: true });
  });

  function approve(question: string) {
    const id = calls.length + 1;
    const controller = new AbortController();
    const reply = sendApprovalQuestion(launch, id, question, controller.signal);
    void reply.catch(() => {});
    calls.push({ controller, reply });
    return { id, controller, reply };
  }

  function waitForQuestion(text: string) {
    return vi.waitFor(() => {
      const pending = questions.pendingFor(TAB);
      if (pending?.question !== text) throw new Error(`expected a pending question: ${text}`);
      return pending;
    });
  }

  it.each([
    { action: 'accepts an offered option', answer: 'Yes', result: 'Yes' },
    { action: 'selects Cancel', answer: null, result: QUESTION_CANCELLED },
  ])('returns the question result when the user $action', async ({ answer, result }) => {
    const call = approve('Deploy?');
    const pending = await waitForQuestion('Deploy?');
    expect(pending).toMatchObject({ tab: TAB, kind: 'approve', options: ['Yes', 'No'] });

    expect(questions.answer(TAB, pending.id, answer)).toBe(true);

    await expect(call.reply).resolves.toMatchObject(expectedReply(call.id, result));
    expect(questions.pendingFor(TAB)).toBeUndefined();
    expect(deliverNotification).not.toHaveBeenCalled();
  });

  it('withdraws a disconnected HTTP call and answers the next queued caller', async () => {
    const register = vi.spyOn(questions, 'register');
    const first = approve('Deploy first?');
    const original = await waitForQuestion('Deploy first?');
    const second = approve('Deploy second?');
    await vi.waitFor(() => { expect(register).toHaveBeenCalledTimes(2); });
    expect(questions.pendingFor(TAB)).toEqual(original);

    first.controller.abort();

    await expect(first.reply).rejects.toMatchObject({ name: 'AbortError' });
    const promoted = await waitForQuestion('Deploy second?');
    expect(promoted.id).not.toBe(original.id);
    expect(deliverNotification).toHaveBeenCalledOnce();
    expect(vi.mocked(deliverNotification).mock.calls[0]?.[1]).toMatchObject({
      event: 'question-withdrawn', tabLabel: TAB, message: 'Question from build withdrawn',
    });
    expect(questions.answer(TAB, promoted.id, 'No')).toBe(true);
    await expect(second.reply).resolves.toMatchObject(expectedReply(second.id, 'No'));
    expect(questions.pendingFor(TAB)).toBeUndefined();
  });
});
