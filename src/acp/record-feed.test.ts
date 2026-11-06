import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Managers } from '../managers.js';
import type { AcpOptions, AcpSession, PromptHandlers } from './types.js';
import { AcpManager } from './manager.js';
import { ShellManager } from '../shell/manager.js';
import { AcpSessionRecords } from '../acp-records/manager.js';
import { AcpRecordStore } from '../acp-records/store.js';
import { TabManager } from '../tab/manager.js';
import { makeTab } from '../tab/index.js';
import { AcpPromptControl } from './prompt-control.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import type { AcpSessionListener } from '../remote/channel/acp.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import { closeTabResources } from '../tab/cleanup.js';

const mock = vi.hoisted(() => ({ connect: vi.fn() }));
const shellMock = vi.hoisted(() => ({ spawn: vi.fn(), execute: vi.fn(), pwd: vi.fn() }));
vi.mock('./index.js', () => ({ connectAcp: mock.connect }));
vi.mock('../shell/index.js', () => ({
  spawnShell: (...args: unknown[]) => shellMock.spawn(...args),
  executeShellCmd: (...args: unknown[]) => shellMock.execute(...args),
  queryShellPwd: (...args: unknown[]) => shellMock.pwd(...args),
}));
vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));
const fixtures: ReturnType<typeof setup>[] = [];

function setup(remote = false) {
  const root = mkdtempSync(path.join(tmpdir(), 'core-record-feed-'));
  const records = new AcpSessionRecords({ projectDir: root });
  const managers = { acpRecords: records } as Managers;
  managers.models = { isKnownModel: () => true } as Managers['models'];
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
  const listeners: AcpSessionListener[] = [];
  const channel = {
    attached: true, send: vi.fn(),
    attachAcp: (_id: string, value: AcpSessionListener) => { listeners.push(value); },
    detachAcp: vi.fn(),
  } as unknown as RemoteChannel;
  managers.remote = { get: () => channel } as Managers['remote'];
  managers.database = { primer: '', isCommandLine: () => false } as unknown as Managers['database'];
  managers.acp = new AcpManager(managers, (_root, role) => ({
    name: role, entries: [{ harness: 'opencode', model: 'google/gemini-3.1-flash-lite' }],
    commands: [...NATIVE_ACP_COMMANDS],
  }));
  if (remote) managers.tab.tabs[0].remote = { host: 'host', address: 'host' };
  const handshake = (index = (remote ? listeners : sessions).length - 1) => {
    if (remote) listeners[index]!.onReady(true);
    else sessions[index]!.options.onConnect?.({ provider: 'reported', model: 'mode' });
  };
  const chunk = (text: string, index = (remote ? listeners : sessions).length - 1) => {
    if (remote) listeners[index]!.onChunk(text);
    else sessions[index]!.control.current!.handlers.onChunk(text);
  };
  const end = (index = (remote ? listeners : sessions).length - 1) => {
    if (remote) listeners[index]!.onEnd('end_turn');
    else {
      const control = sessions[index]!.control;
      control.end(control.current!, 'end_turn');
    }
  };
  const fixture = {
    root, records, managers, sessions, handshake, chunk, end, shell: undefined as ShellManager | undefined,
    listener: () => listeners.at(-1)!,
  };
  fixtures.push(fixture);
  return fixture;
}

afterEach(() => {
  for (const f of fixtures) {
    f.shell?.closeAll();
    f.managers.acp.closeAll();
    f.records.dispose();
    rmSync(f.root, { recursive: true, force: true });
  }
  fixtures.length = 0;
  vi.clearAllMocks();
});

describe('core record feeds', () => {
  it('isolates concurrent role streams and keeps the tab busy until both settle', async () => {
    const f = setup();
    const ask = f.managers.acp.prompt('owner', 'ask first');
    const tell = f.managers.acp.prompt('owner', 'tell second', 'tell');

    expect(f.sessions).toHaveLength(2);
    f.handshake(0);
    f.handshake(1);
    const askId = f.managers.tab.byLabel('owner')!.runtime!.acpRoles!.ask!.recordId!;
    const tellId = f.managers.tab.byLabel('owner')!.runtime!.acpRoles!.tell!.recordId!;
    expect(askId).not.toBe(tellId);
    expect(f.records.window(askId)?.source).toMatchObject({ role: 'ask' });
    expect(f.records.window(tellId)?.source).toMatchObject({ role: 'tell' });

    f.chunk('ask partial', 0);
    f.chunk('tell partial', 1);
    f.end(0);
    await expect(ask).resolves.toBe('ask partial');
    expect(f.managers.tab.byLabel('owner')!.runtime?.busy).toBe(true);

    f.chunk(' + tell final', 1);
    f.end(1);
    await expect(tell).resolves.toBe('tell partial + tell final');
    expect(f.managers.tab.byLabel('owner')!.runtime?.busy).toBe(false);
    expect(f.records.window(askId)?.blocks).toMatchObject([{ prompt: 'first', answer: 'ask partial' }]);
    expect(f.records.window(tellId)?.blocks).toMatchObject([{ prompt: 'second', answer: 'tell partial + tell final' }]);
    expect(f.managers.tab.byLabel('owner')?.log.map(({ input, output }) => ({ input, output }))).toEqual([
      { input: 'first', output: 'ask partial' },
      { input: 'second', output: 'tell partial + tell final' },
    ]);
  });

  it('keeps shell activity busy until both ask and tell prompts settle when shell finishes first', async () => {
    const f = setup();
    shellMock.spawn.mockReturnValue({ stdin: { writable: true, write: vi.fn() }, kill: vi.fn() });
    shellMock.pwd.mockImplementation((_shell, _index, onPwd) => onPwd('/project'));
    f.shell = new ShellManager(f.managers);
    const ask = f.managers.acp.prompt('owner', 'ask first');
    const tell = f.managers.acp.prompt('owner', 'tell second', 'tell');
    f.shell.run('owner', 'printf shell');
    await vi.waitFor(() => { expect(shellMock.execute).toHaveBeenCalledOnce(); });
    f.handshake(0);
    f.handshake(1);
    expect(f.managers.tab.isBusy('owner')).toBe(true);

    const shellDone = shellMock.execute.mock.calls[0]![4] as (result: string) => void;
    shellDone('shell output');
    expect(f.managers.tab.isBusy('owner')).toBe(true);

    f.chunk('ask answer', 0);
    f.end(0);
    await expect(ask).resolves.toBe('ask answer');
    expect(f.managers.tab.isBusy('owner')).toBe(true);

    f.chunk('tell answer', 1);
    f.end(1);
    await expect(tell).resolves.toBe('tell answer');
    expect(f.managers.tab.isBusy('owner')).toBe(false);
  });

  it('keeps shell activity busy while ask and tell settle before the shell', async () => {
    const f = setup();
    shellMock.spawn.mockReturnValue({ stdin: { writable: true, write: vi.fn() }, kill: vi.fn() });
    shellMock.pwd.mockImplementation((_shell, _index, onPwd) => onPwd('/project'));
    f.shell = new ShellManager(f.managers);
    const ask = f.managers.acp.prompt('owner', 'ask first');
    const tell = f.managers.acp.prompt('owner', 'tell second', 'tell');
    f.shell.run('owner', 'printf shell');
    await vi.waitFor(() => { expect(shellMock.execute).toHaveBeenCalledOnce(); });
    f.handshake(0);
    f.handshake(1);

    f.chunk('ask answer', 0);
    f.end(0);
    await expect(ask).resolves.toBe('ask answer');
    expect(f.managers.tab.isBusy('owner')).toBe(true);

    f.chunk('tell answer', 1);
    f.end(1);
    await expect(tell).resolves.toBe('tell answer');
    expect(f.managers.tab.isBusy('owner')).toBe(true);

    const shellDone = shellMock.execute.mock.calls[0]![4] as (result: string) => void;
    shellDone('shell output');
    expect(f.managers.tab.isBusy('owner')).toBe(false);
  });

  it('allows a close settlement callback to synchronously start a fresh session and record', async () => {
    const f = setup();
    let next: Promise<string> | undefined;
    f.managers.acp.run('owner', 'first', () => { next = f.managers.acp.prompt('owner', 'second'); });
    f.handshake();
    const oldId = f.records.rows()[0].id;
    f.managers.acp.close('owner');
    f.handshake();
    const newId = f.managers.tab.byLabel('owner')!.runtime!.acpRoles!.ask!.recordId!;
    expect(newId).not.toBe(oldId);
    f.chunk('new answer');
    f.end();
    await expect(next).resolves.toBe('new answer');
    expect(f.records.window(oldId)?.status).toBe('Closed');
    expect(f.records.window(newId)?.status).toBe('Idle');
  });
  it.each([false, true])('captures the remote host on the record only for a remote tab (remote: %s)', async (remote) => {
    const f = setup(remote);
    const pending = f.managers.acp.prompt('owner', 'where');
    f.handshake();
    const [row] = f.records.rows();
    if (remote) expect(row).toMatchObject({ host: 'host' });
    else expect(row).not.toHaveProperty('host');
    f.chunk('here');
    f.end();
    await pending;
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
    expect(f.managers.tab.byLabel('owner')!.runtime?.acpRoles?.ask?.prompt).toBeUndefined();
    expect(f.records.rows()).toEqual([]);
  });
  it.each([false, true])('captures the first reserved prompt and five activity kinds (remote: %s)', async (remote) => {
    const f = setup(remote);
    f.managers.acp.start('owner', { withoutTools: true });
    expect(f.records.rows()).toEqual([]);
    const answer = f.managers.acp.prompt('owner', 'ask first\nsecond line');
    f.handshake();
    const id = f.managers.tab.byLabel('owner')!.runtime!.acpRoles!.ask!.recordId!;
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

  it('keeps every record the tab began among its owned ids after each session closes', () => {
    const f = setup();
    f.managers.acp.start('owner');
    f.handshake();
    const first = f.managers.tab.byLabel('owner')!.runtime!.acpRoles!.ask!.recordId!;
    f.managers.acp.close('owner');
    f.managers.acp.start('owner');
    f.handshake();
    const second = f.managers.tab.byLabel('owner')!.runtime!.acpRoles!.ask!.recordId!;
    expect(second).not.toBe(first);
    expect([...f.managers.tab.byLabel('owner')!.runtime!.acpRecordIds!]).toEqual([first, second]);
    f.managers.tab.tabs = [makeTab('owner', '#abc')];
    expect(f.managers.tab.byLabel('owner')!.runtime?.acpRecordIds).toBeUndefined();
  });

  it('keeps role records and prompt state separate while retaining ask defaults', async () => {
    const f = setup();
    f.managers.acp.start('owner');
    f.handshake();
    const askId = f.managers.tab.byLabel('owner')!.runtime!.acpRoles!.ask!.recordId!;
    f.managers.acp.start('owner', undefined, 'tell');
    f.handshake();
    const tellId = f.managers.tab.byLabel('owner')!.runtime!.acpRoles!.tell!.recordId!;
    expect(askId).not.toBe(tellId);
    expect(f.records.window(askId)).toMatchObject({ role: 'ask', source: { role: 'ask' } });
    expect(f.records.window(tellId)).toMatchObject({ role: 'tell', source: { role: 'tell' } });

    const tellAnswer = f.managers.acp.prompt('owner', 'a separate prompt', 'tell');
    f.chunk('tell answer');
    f.end();
    await expect(tellAnswer).resolves.toBe('tell answer');
    expect(f.records.window(askId)?.blocks).toEqual([]);
    expect(f.records.window(tellId)?.blocks).toMatchObject([{ prompt: 'a separate prompt', answer: 'tell answer' }]);

    expect(f.managers.acp.close('owner', undefined, 'ask')).toBe(true);
    expect(f.managers.acp.has('owner')).toBe(false);
    expect(f.managers.acp.has('owner', 'tell')).toBe(true);
    expect(f.records.window(askId)?.status).toBe('Closed');
    expect(f.records.window(tellId)?.status).toBe('Idle');
    f.managers.acp.closeTab('owner');
    expect(f.records.window(tellId)?.status).toBe('Closed');
  });

  it('closes every role session and record when their shared remote transport is lost', () => {
    const f = setup(true);
    f.managers.acp.start('owner');
    f.handshake();
    f.managers.acp.start('owner', undefined, 'tell');
    f.handshake();
    const ids = f.records.rows().map(({ id }) => id);
    expect(ids).toHaveLength(2);

    f.listener().onTransportLost?.();

    expect(f.managers.acp.has('owner')).toBe(false);
    expect(f.managers.acp.has('owner', 'tell')).toBe(false);
    expect(ids.map((id) => f.records.window(id)?.status)).toEqual(['Closed', 'Closed']);
  });

  it('closes every role session and record through tab resource cleanup', async () => {
    const f = setup();
    f.managers.acp.start('owner');
    f.handshake();
    f.managers.acp.start('owner', undefined, 'tell');
    f.handshake();
    const ids = f.records.rows().map(({ id }) => id);
    const noOpManager = { closeTab: () => {} };
    Object.assign(f.managers, {
      shell: noOpManager, schedule: noOpManager, pty: noOpManager, terminalRuntime: noOpManager,
      harness: noOpManager, shellTranscript: noOpManager, editorAcp: noOpManager, editorWatch: noOpManager,
      fileNavigator: noOpManager, browser: noOpManager, questions: noOpManager,
      remote: { ...f.managers.remote, closeTab: () => {} },
      database: { ...f.managers.database, closeTab: () => {} },
    });

    await closeTabResources(f.managers.tab.byLabel('owner')!, f.managers, new Map());

    expect(f.managers.acp.has('owner')).toBe(false);
    expect(f.managers.acp.has('owner', 'tell')).toBe(false);
    expect(ids.map((id) => f.records.window(id)?.status)).toEqual(['Closed', 'Closed']);
  });

  it('never publishes a late handshake after close and creates no record for refusals', async () => {
    const f = setup();
    await expect(f.managers.acp.prompt('owner', 'ask')).resolves.toBe('Usage: ask <prompt>.');
    await expect(f.managers.acp.prompt('missing', 'hi')).resolves.toBe('Tab not found');
    f.managers.acp.start('owner');
    const old = f.sessions[0];
    f.managers.acp.close('owner');
    old.options.onConnect?.({});
    expect(f.records.rows()).toEqual([]);
    expect(f.managers.acp.label('owner')).toBeUndefined();
  });
});
