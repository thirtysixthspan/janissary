import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';
import type { AcpOptions, AcpSession, PromptHandlers } from './types.js';
import { AcpManager } from './manager.js';
import { AcpSessionRecords } from '../acp-records/manager.js';
import { AcpRecordStore } from '../acp-records/store.js';
import { TabManager } from '../tab/manager.js';
import { makeTab } from '../tab/index.js';
import { AcpPromptControl } from './prompt-control.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import type { AcpSessionListener } from '../remote/channel/acp.js';

const mock = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('./index.js', () => ({ connectAcp: mock.connect }));
vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));
const fixtures: ReturnType<typeof setup>[] = [];

function setup(remote = false) {
  const root = mkdtempSync(path.join(tmpdir(), 'core-record-feed-'));
  const records = new AcpSessionRecords({ projectDir: root });
  const managers = { acpRecords: records } as Managers;
  managers.tab = new TabManager(managers);
  managers.tab.tabs.push(makeTab('owner', '#fff'));
  managers.tab.tabs[0].title = 'Original owner';
  const sessions: { session: AcpSession; options: AcpOptions; control: AcpPromptControl; handlers?: PromptHandlers }[] = [];
  mock.connect.mockImplementation((options: AcpOptions) => {
    const control = new AcpPromptControl();
    const session: AcpSession = {
      prompt: vi.fn((_text, handlers) => { control.admit(handlers); }),
      cancel: () => control.cancel(async () => {}),
      kill: () => control.release(), shutdown: async () => control.release(),
    };
    sessions.push({ session, options, control });
    return session;
  });
  let listener: AcpSessionListener | undefined;
  const channel = {
    attached: true, send: vi.fn(),
    attachAcp: (_id: string, value: AcpSessionListener) => { listener = value; },
    detachAcp: vi.fn(),
  } as unknown as RemoteChannel;
  managers.remote = { get: () => channel } as Managers['remote'];
  managers.database = { primer: '', isCommandLine: () => false } as unknown as Managers['database'];
  managers.acp = new AcpManager(managers);
  if (remote) managers.tab.tabs[0].remote = { host: 'host', address: 'host' };
  const handshake = () => {
    if (remote) listener!.onReady(true);
    else sessions.at(-1)!.options.onConnect?.({ provider: 'reported', model: 'mode' });
  };
  const chunk = (text: string) => {
    if (remote) listener!.onChunk(text);
    else sessions.at(-1)!.control.current!.handlers.onChunk(text);
  };
  const end = () => {
    if (remote) listener!.onEnd('end_turn');
    else {
      const control = sessions.at(-1)!.control;
      control.end(control.current!, 'end_turn');
    }
  };
  const fixture = { root, records, managers, sessions, handshake, chunk, end, listener: () => listener! };
  fixtures.push(fixture);
  return fixture;
}

afterEach(() => {
  for (const f of fixtures) {
    f.managers.acp.closeAll();
    f.records.dispose();
    rmSync(f.root, { recursive: true, force: true });
  }
  fixtures.length = 0;
  vi.clearAllMocks();
});

describe('core record feeds', () => {
  it('allows a close settlement callback to synchronously start a fresh session and record', async () => {
    const f = setup();
    let next: Promise<string> | undefined;
    f.managers.acp.run('owner', 'first', () => { next = f.managers.acp.prompt('owner', 'second'); });
    f.handshake();
    const oldId = f.records.rows()[0].id;
    f.managers.acp.close('owner');
    f.handshake();
    const newId = f.managers.tab.byLabel('owner')!.runtime!.acpRecordId!;
    expect(newId).not.toBe(oldId);
    f.chunk('new answer');
    f.end();
    await expect(next).resolves.toBe('new answer');
    expect(f.records.window(oldId)?.status).toBe('Closed');
    expect(f.records.window(newId)?.status).toBe('Idle');
  });
  it.each([false, true])('settles and closes on fatal loss while cancellation drains (remote: %s)', async (remote) => {
    const f = setup(remote);
    const pending = f.managers.acp.prompt('owner', 'held');
    f.handshake();
    const id = f.records.rows()[0].id;
    const cancellation = f.managers.acp.cancel('owner');
    if (remote) f.listener().onTransportLost?.();
    else f.sessions[0].options.onError('fatal loss');
    await expect(cancellation).resolves.toBe(true);
    await expect(pending).resolves.toBe(remote ? 'ACP: Remote connection lost.' : 'ACP: fatal loss');
    expect(f.records.window(id)).toMatchObject({ status: 'Closed', totalBlocks: 1 });
  });

  it('reports a construction failure precisely and does not strand the logical request', async () => {
    const f = setup();
    mock.connect.mockImplementation(() => { throw new Error('start failed'); });
    await expect(f.managers.acp.prompt('owner', 'first')).resolves.toBe('ACP error: start failed');
    expect(f.managers.tab.byLabel('owner')!.runtime?.acpPrompt).toBeUndefined();
    expect(f.records.rows()).toEqual([]);
  });
  it.each([false, true])('captures the first reserved prompt and five activity kinds (remote: %s)', async (remote) => {
    const f = setup(remote);
    f.managers.acp.start('owner', { withoutTools: true });
    expect(f.records.rows()).toEqual([]);
    const answer = f.managers.acp.prompt('owner', 'acp first\nsecond line');
    f.handshake();
    const id = f.managers.tab.byLabel('owner')!.runtime!.acpRecordId!;
    expect(id).not.toBe(f.managers.acp.sessionIdentity('owner'));
    const kinds = ['message', 'thought', 'tool', 'plan', 'permission'] as const;
    const updates = ['agent_message_chunk', 'agent_thought_chunk', 'tool_call', 'plan', 'permission_decision'];
    for (const [index, kind] of kinds.entries()) {
      if (remote) f.listener().onActivity(kind, ' ');
      else f.sessions[0].options.onActivity?.({ sessionUpdate: updates[index], content: ' ' });
    }
    f.chunk('displayed once');
    f.end();
    await expect(answer).resolves.toBe('displayed once');
    expect(f.records.window(id)).toMatchObject({
      status: 'Idle', source: { ownerLabel: 'owner', ownerName: 'Original owner', model: 'google/gemini-3.1-flash-lite' },
      blocks: [{ prompt: 'first\nsecond line', answer: 'displayed once', entries: kinds.map((kind) => ({ kind, text: ' ' })) }],
    });
    f.managers.acp.close('owner');
    expect(new AcpRecordStore({ projectDir: f.root }).read(id)).toMatchObject({ outcome: 'Closed', blocks: [{ answer: 'displayed once' }] });
    const restarted = new AcpSessionRecords({ projectDir: f.root });
    expect(restarted.window(id)?.status).toBe('Closed');
    restarted.dispose();
  });

  it('refuses every overlapping entry point without settling or adding a block', async () => {
    const f = setup();
    const first = f.managers.acp.prompt('owner', 'first');
    f.handshake();
    const id = f.records.rows()[0].id;
    const before = f.records.window(id);
    await expect(f.managers.acp.promptResult('owner', 'overlap')).resolves.toEqual({ answered: false, error: 'ACP: a prompt is already running.' });
    const done = vi.fn();
    f.managers.acp.run('owner', 'overlap', done);
    expect(done).toHaveBeenCalledWith({ answered: false, error: 'ACP: a prompt is already running.' });
    expect(f.records.window(id)).toEqual(before);
    f.chunk('answer');
    f.end();
    await expect(first).resolves.toBe('answer');
    expect(f.records.window(id)?.totalBlocks).toBe(1);
  });

  it('keeps one logical block for a cold retry and accepts its empty answer', async () => {
    const f = setup();
    const pending = f.managers.acp.prompt('owner', 'empty');
    f.handshake();
    f.end();
    f.end();
    await expect(pending).resolves.toBe('');
    expect(f.records.window(f.records.rows()[0].id)?.blocks).toMatchObject([{ answer: '' }]);
  });

  it('retains runtime ownership across shallow copies and ignores a closed generation after label reuse', async () => {
    const f = setup();
    const pending = f.managers.acp.prompt('owner', 'first');
    const old = f.sessions[0];
    f.managers.tab.tabs = f.managers.tab.tabs.map((tab) => ({ ...tab }));
    f.handshake();
    const id = f.records.rows()[0].id;
    f.chunk('partial');
    old.options.onActivity?.({ sessionUpdate: 'agent_message_chunk', content: 'partial' });
    f.managers.acp.close('owner');
    await expect(pending).resolves.toBe('ACP session closed.');
    f.managers.tab.tabs = [makeTab('owner', '#abc')];
    const next = f.managers.acp.prompt('owner', 'second');
    f.handshake();
    old.options.onConnect?.({});
    old.options.onActivity?.({ sessionUpdate: 'agent_message_chunk', content: 'obsolete' });
    old.options.onError('obsolete');
    f.chunk('new');
    f.end();
    await expect(next).resolves.toBe('new');
    expect(f.records.rows()).toHaveLength(2);
    expect(f.records.window(id)).toMatchObject({ status: 'Closed', ownerName: 'Original owner', blocks: [{ answer: 'ACP session closed.', entries: [{ text: 'partial' }] }] });
  });

  it('never publishes a late handshake after close and creates no record for refusals', async () => {
    const f = setup();
    await expect(f.managers.acp.prompt('owner', 'acp')).resolves.toBe('Usage: acp <prompt>.');
    await expect(f.managers.acp.prompt('missing', 'hi')).resolves.toBe('Tab not found');
    f.managers.acp.start('owner');
    const old = f.sessions[0];
    f.managers.acp.close('owner');
    old.options.onConnect?.({});
    expect(f.records.rows()).toEqual([]);
    expect(f.managers.acp.label('owner')).toBeUndefined();
  });
});
