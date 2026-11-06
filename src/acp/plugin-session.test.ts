import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcpOptions, PromptHandlers } from './types.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AcpSessionRecords } from '../acp-records/manager.js';
import type { Managers } from '../managers.js';
import type { AcpRoleSettings } from './ask-role.js';
import type { AcpRole } from './role.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import { TabManager } from '../tab/manager.js';
import { makeTab } from '../tab/index.js';
import { messageBus } from '../bus.js';
import { acpCapabilities } from '../plugins/acp-capabilities.js';
import { guardPluginCall } from '../plugins/guard.js';
import { Questions, QUESTION_CANCELLED } from '../questions.js';
import { CommandManager } from '../command/manager.js';

const mock = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('./index.js', () => ({ connectAcp: mock.connect }));
vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));
import { AcpManager } from './manager.js';

const projects: { root: string; managers: Managers }[] = [];

function setup(roleSettings?: (root: string, role: AcpRole) => AcpRoleSettings) {
  const managers = {} as Managers;
  const root = mkdtempSync(path.join(tmpdir(), 'plugin-acp-records-'));
  managers.acpRecords = new AcpSessionRecords({ projectDir: root });
  projects.push({ root, managers });
  managers.tab = new TabManager(managers);
  managers.questions = new Questions();
  managers.tab.tabs.push(makeTab('agent', '#fff'), {
    ...makeTab('consumer', '#abc'), view: 'plugin',
    plugin: { id: 'any-plugin', instanceKey: 'one', schemaVersion: 1, payload: {} },
  });
  let handlers: PromptHandlers | undefined;
  const session = {
    prompt: vi.fn((_text: string, next: PromptHandlers) => { handlers = next; }), kill: vi.fn(),
    cancel: vi.fn(async () => {}), shutdown: vi.fn(async () => {}),
  };
  mock.connect.mockImplementation((options: { onConnect(): void }) => { options.onConnect(); return session; });
  Object.assign(managers, {
    models: { isKnownModel: () => true },
    plugins: { declarations: [{ id: 'any-plugin', capabilities: ['startAcp', 'promptAcp', 'resetAcp'] }] },
    database: { primer: 'db', isCommandLine: () => false, openDbs: () => [] },
    browser: { run: vi.fn() },
    shell: { run: vi.fn((_label: string, _text: string, options: { onComplete(text: string): void }) => options.onComplete('ran')) },
  });
  managers.acp = new AcpManager(managers, roleSettings
    ?? ((_root, role) => ({
      name: role, entries: [{ harness: 'opencode', model: 'google/gemini-3.1-flash-lite' }],
      commands: [...NATIVE_ACP_COMMANDS],
    })));
  managers.command = new CommandManager(managers);
  return { managers, session, handlers: () => handlers! };
}

afterEach(() => {
  for (const { root, managers } of projects) {
    managers.acp.closeAll();
    managers.acpRecords.dispose();
    rmSync(root, { recursive: true, force: true });
  }
  projects.length = 0;
  vi.clearAllMocks();
  messageBus.clear();
});

describe('core ACP for plugin tabs', () => {
  it('suppresses a browser result and every follow-up after cancellation', async () => {
    const { managers, handlers, session } = setup();
    const browser = Promise.withResolvers<string>();
    vi.mocked(managers.browser.run).mockReturnValue(browser.promise);
    const pending = managers.acp.prompt('consumer', 'open a page');
    handlers().onChunk('browser goto https://example.com');
    handlers().onEnd('end_turn');
    const cancel = managers.acp.cancel('consumer');
    await expect(cancel).resolves.toBe(true);
    await expect(pending).resolves.toBe('ACP: prompt cancelled.');
    browser.resolve('late browser result');
    await Promise.resolve();
    await Promise.resolve();
    expect(session.prompt).toHaveBeenCalledOnce();
    const record = managers.acpRecords.window(managers.acpRecords.rows()[0].id)!;
    expect(record.blocks[0].entries.map((entry) => entry.text)).toEqual(['browser goto https://example.com']);
  });

  it('closes and settles on cancellation-send failure instead of reporting a safely idle session', async () => {
    const { managers, session } = setup();
    const pending = managers.acp.prompt('consumer', 'held');
    session.cancel.mockRejectedValue(new Error('write failed'));
    await expect(managers.acp.cancel('consumer')).resolves.toBe(true);
    await expect(pending).resolves.toBe('ACP: cancellation failed: write failed');
    expect(managers.acpRecords.rows()[0].status).toBe('Closed');
    expect(managers.acp.has('consumer')).toBe(false);
  });
  it.each([true, false])('cancel aborts only its own active or queued question (queued: %s)', async (queued) => {
    const { managers, handlers, session } = setup();
    const askOther = () => managers.questions.register({ tab: 'consumer', kind: 'ask', question: 'Other request' });
    let other = queued ? askOther() : undefined;
    const pending = managers.acp.prompt('consumer', 'ask ask me');
    const id = managers.tab.byLabel('consumer')!.runtime!.acpRoles!.ask!.recordId!;
    const identity = managers.acp.sessionIdentity('consumer');
    handlers().onChunk('question ask "ACP request"');
    handlers().onEnd('end_turn');
    other ??= askOther();
    const cancel = managers.acp.cancel('consumer');
    expect(managers.questions.pendingFor('consumer')?.question).toBe('Other request');
    await expect(cancel).resolves.toBe(true);
    await expect(pending).resolves.toBe('ACP: prompt cancelled.');
    expect(managers.acp.sessionIdentity('consumer')).toBe(identity);
    expect(managers.tab.byLabel('consumer')!.runtime!.acpRoles!.ask!.recordId).toBe(id);
    expect(managers.acpRecords.window(id)).toMatchObject({ status: 'Idle', blocks: [{ answer: 'ACP: prompt cancelled.' }] });
    const questionId = managers.questions.pendingFor('consumer')!.id;
    managers.questions.answer('consumer', questionId, 'Answer');
    await expect(other).resolves.toBe('Answer');
    expect(session.prompt).toHaveBeenCalledOnce();
    expect(session.kill).not.toHaveBeenCalled();
  });

  it('keeps its logical reservation while native cancellation drains and suppresses late loop callbacks', async () => {
    const { managers, handlers, session } = setup();
    const pending = managers.acp.prompt('consumer', 'ask first');
    const drain = Promise.withResolvers<void>();
    session.cancel.mockReturnValue(drain.promise);
    const old = handlers();
    const cancel = managers.acp.cancel('consumer');
    expect(managers.acp.cancel('consumer')).toBe(cancel);
    old.onChunk('question ask "Too late"');
    old.onEnd('end_turn');
    expect(managers.questions.pendingFor('consumer')).toBeUndefined();
    await expect(managers.acp.prompt('consumer', 'next')).resolves.toBe('ACP: a prompt is already running.');
    const id = managers.tab.byLabel('consumer')!.runtime!.acpRoles!.ask!.recordId!;
    const options = mock.connect.mock.calls[0][0] as AcpOptions;
    options.onActivity?.({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'final thought' } });
    expect(managers.acpRecords.window(id)?.status).toBe('Running');
    drain.resolve();
    await cancel;
    await expect(pending).resolves.toBe('ACP: prompt cancelled.');
    const next = managers.acp.prompt('consumer', 'next');
    old.onError('stale');
    handlers().onChunk('new answer');
    handlers().onEnd('end_turn');
    await expect(next).resolves.toBe('new answer');
    expect(managers.acpRecords.window(id)?.blocks).toHaveLength(2);
  });

  it('settles reset immediately even when a cancellation transport never drains', async () => {
    const { managers, session } = setup();
    const pending = managers.acp.prompt('consumer', 'held');
    session.cancel.mockReturnValue(new Promise<void>(() => {}));
    const cancel = managers.acp.cancel('consumer');
    managers.acp.close('consumer');
    await expect(cancel).resolves.toBe(true);
    await expect(pending).resolves.toBe('ACP session closed.');
    expect(managers.acpRecords.rows()[0].status).toBe('Closed');
  });

  it('starts without a terminal, reuses the session, and retains tagged transcript entries', async () => {
    const { managers, handlers } = setup();
    expect(managers.acp.start('consumer').model).toBeDefined();
    const answer = managers.acp.prompt('consumer', 'ask hello');
    const tab = managers.tab.byLabel('consumer')!;
    const original = tab.log.find((entry) => entry.running)!;
    expect(tab.runtime?.acpEntries?.has(original)).toBe(true);
    handlers().onChunk('# Partial');
    const replacement = tab.log.find((entry) => entry.running)!;
    expect(replacement).not.toBe(original);
    expect(tab.runtime?.acpEntries?.has(replacement)).toBe(true);
    managers.tab.append('consumer', { input: 'help', output: 'unrelated' });
    expect(tab.runtime?.acpRoles?.ask?.prompt).toBeDefined();
    expect(replacement.output).toBe('# Partial');
    expect(tab.runtime?.acpEntries?.has(tab.log.at(-1)!)).toBe(false);
    handlers().onEnd('end_turn');
    await expect(answer).resolves.toBe('# Partial');
    expect(mock.connect).toHaveBeenCalledTimes(1);
    expect(tab.runtime?.acpRoles?.ask?.prompt).toBeUndefined();
    expect(tab.log.find((entry) => entry.markdown)).toMatchObject({ output: '# Partial', running: false });
    expect(managers.acpRecords.window(tab.runtime!.acpRoles!.ask!.recordId!)?.blocks).toMatchObject([{ answer: '# Partial' }]);
    const next = managers.acp.prompt('consumer', 'again');
    handlers().onChunk('Reused');
    handlers().onEnd('end_turn');
    await expect(next).resolves.toBe('Reused');
    expect(mock.connect).toHaveBeenCalledOnce();
    managers.acp.closeAll();
  });

  it('settles reset calls and ignores old chunks after a successor prompt starts', async () => {
    const { managers, handlers, session } = setup();
    const first = managers.acp.prompt('consumer', 'ask first');
    const old = handlers();
    managers.acp.close('consumer');
    await expect(first).resolves.toBe('ACP session closed.');
    const second = managers.acp.prompt('consumer', 'ask second');
    old.onChunk('obsolete');
    expect(managers.tab.byLabel('consumer')!.log.some((entry) => entry.output.includes('obsolete'))).toBe(false);
    handlers().onChunk('new');
    handlers().onEnd('end_turn');
    await expect(second).resolves.toBe('new');
    expect(session.kill).toHaveBeenCalledTimes(1);
    managers.acp.closeAll();
  });

  it('rejects overlapping prompts without taking down the existing prompt', async () => {
    const { managers, handlers } = setup();
    const pending = managers.acp.prompt('consumer', 'ask first');
    await expect(managers.acp.prompt('consumer', 'ask second')).resolves.toBe('ACP: a prompt is already running.');
    handlers().onChunk('first answer');
    handlers().onEnd('end_turn');
    await expect(pending).resolves.toBe('first answer');
    managers.acp.closeAll();
  });

  it('returns core streaming dispatch immediately and appends one background reply when it settles', async () => {
    const { managers, handlers } = setup();
    const result = managers.command.dispatchLineWithOutput('consumer', 'ask hello', 1);
    await expect(result).resolves.toEqual({ dispatched: true, output: '', coreResponse: true });
    expect(managers.tab.byLabel('consumer')!.log.some((entry) => entry.background)).toBe(false);

    handlers().onChunk('Answer');
    handlers().onEnd('end_turn');

    await vi.waitFor(() => {
      const replies = managers.tab.byLabel('consumer')!.log.filter((entry) => entry.background);
      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({ input: 'ask hello', output: 'Answer' });
    });
    const tab = managers.tab.byLabel('consumer')!;
    expect(tab.log.find((entry) => tab.runtime?.acpEntries?.has(entry) && entry.markdown)).toMatchObject({ output: 'Answer', running: false });
    expect(tab.runtime?.acpRoles?.ask?.prompt).toBeUndefined();
    managers.acp.closeAll();
  });

  it('reports the capped tool-step notice once in the settled reply and record answer', async () => {
    const { managers, handlers, session } = setup();
    vi.mocked(managers.browser.run).mockResolvedValue('page');
    await managers.command.dispatchLineWithOutput('consumer', 'ask hello', 1);

    for (let step = 0; step < 8; step += 1) {
      handlers().onChunk('browser goto https://example.com');
      handlers().onEnd('end_turn');
      await vi.waitFor(() => { expect(session.prompt).toHaveBeenCalledTimes(step + 2); });
    }
    handlers().onChunk('Partial answer\nbrowser goto https://example.com');
    handlers().onEnd('end_turn');

    const tab = managers.tab.byLabel('consumer')!;
    await vi.waitFor(() => {
      const replies = tab.log.filter((entry) => entry.background);
      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({
        input: 'ask hello',
        output: 'Partial answer\n\n(stopped after 8 tool steps)',
      });
    });
    expect(managers.acpRecords.window(managers.acpRecords.rows()[0].id)?.blocks)
      .toMatchObject([{ answer: 'Partial answer\n\n(stopped after 8 tool steps)' }]);
    managers.acp.closeAll();
  });

  it('records refusals from a restricted role as tool results and counts them toward the cap', async () => {
    const { managers, handlers, session } = setup(() => ({
      name: 'ask',
      entries: [{ harness: 'opencode', model: 'google/gemini-3.1-flash-lite' }],
      commands: ['browser goto'],
    }));
    const command = 'browser eval document.title';
    const refusal = 'Command not allowed for role "ask": browser eval.';
    await managers.command.dispatchLineWithOutput('consumer', 'ask restricted', 1);

    for (let step = 0; step < 8; step += 1) {
      handlers().onChunk(command);
      await handlers().onEnd('end_turn');
      if (step < 7) {
        await vi.waitFor(() => { expect(session.prompt).toHaveBeenCalledTimes(step + 2); });
      }
    }
    handlers().onChunk(`Partial answer\n${command}`);
    await handlers().onEnd('end_turn');

    const tab = managers.tab.byLabel('consumer')!;
    await vi.waitFor(() => {
      expect(tab.log.filter((entry) => entry.input === command && entry.output === refusal)).toHaveLength(8);
      expect(tab.log.find((entry) => entry.background)).toMatchObject({
        input: 'ask restricted', output: 'Partial answer\n\n(stopped after 8 tool steps)',
      });
    });
    const record = managers.acpRecords.window(managers.acpRecords.rows()[0].id)!;
    expect(record.blocks[0].entries.filter((entry) => entry.text === refusal)).toHaveLength(8);
    expect(managers.browser.run).not.toHaveBeenCalled();
    expect(session.prompt).toHaveBeenCalledTimes(9);
    managers.acp.closeAll();
  });

  it('refuses a second shell prompt without replacing the first', async () => {
    const { managers, handlers } = setup();
    await managers.command.dispatchLineWithOutput('consumer', 'ask first', 1);
    await managers.command.dispatchLineWithOutput('consumer', 'ask second', 1);

    await vi.waitFor(() => {
      const replies = managers.tab.byLabel('consumer')!.log.filter((entry) => entry.background);
      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({ input: 'ask second', output: 'ACP: a prompt is already running.' });
    });

    handlers().onChunk('first answer');
    handlers().onEnd('end_turn');

    await vi.waitFor(() => {
      const replies = managers.tab.byLabel('consumer')!.log.filter((entry) => entry.background);
      expect(replies).toHaveLength(2);
      expect(replies[1]).toMatchObject({ input: 'ask first', output: 'first answer' });
    });
    managers.acp.closeAll();
  });

  it('settles a pending shell prompt once when its session closes', async () => {
    const { managers } = setup();
    await managers.command.dispatchLineWithOutput('consumer', 'ask held', 1);
    managers.acp.close('consumer');

    await vi.waitFor(() => {
      const replies = managers.tab.byLabel('consumer')!.log.filter((entry) => entry.background);
      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({ input: 'ask held', output: 'ACP session closed.' });
    });
    managers.acp.closeAll();
  });

  it('dispatches idle resets once under the exact reset invocation', async () => {
    const { managers } = setup();
    managers.acp.start('consumer');
    for (const line of ['  /AsK   ReSeT  ', '/ask reset']) {
      await expect(managers.command.dispatchLineWithOutput('consumer', line, 1))
        .resolves.toEqual({ dispatched: true, output: '', coreResponse: true });
    }
    const tab = managers.tab.byLabel('consumer')!;
    const replies = tab.log.filter((entry) => entry.background);
    expect(replies).toMatchObject([
      { input: '  /AsK   ReSeT  ', output: 'ACP session reset — next ask prompt will start fresh.' },
      { input: '/ask reset', output: 'No active ACP session to reset.' },
    ]);
    expect(replies).toHaveLength(2);
    expect(new Set(replies.map((entry) => entry.background)).size).toBe(2);
    expect(replies.every((entry) => tab.runtime?.acpEntries?.has(entry) && !entry.running)).toBe(true);
  });

  it('dispatches reset during a prompt with distinct once-only prompt-close and reset replies', async () => {
    const { managers, handlers } = setup();
    const promptLine = '/ask held';
    await managers.command.dispatchLineWithOutput('consumer', promptLine, 1);
    handlers().onChunk('Partial');
    const tab = managers.tab.byLabel('consumer')!;
    const shell = { input: 'sleep 10', output: 'still working', running: true };
    managers.tab.append('consumer', shell);
    const resetLine = ' /ASK  reset ';

    await expect(managers.command.dispatchLineWithOutput('consumer', resetLine, 1))
      .resolves.toEqual({ dispatched: true, output: '', coreResponse: true });
    handlers().onChunk('obsolete');
    handlers().onError('obsolete error');
    await vi.waitFor(() => { expect(tab.log.filter((entry) => entry.background)).toHaveLength(2); });

    const replies = tab.log.filter((entry) => entry.background);
    expect(replies).toEqual(expect.arrayContaining([
      expect.objectContaining({ input: promptLine, output: 'ACP session closed.' }),
      expect.objectContaining({ input: resetLine, output: 'ACP session reset — next ask prompt will start fresh.' }),
    ]));
    expect(new Set(replies.map((entry) => entry.background)).size).toBe(2);
    expect(tab.log.filter((entry) => entry.output === 'ACP session reset — next ask prompt will start fresh.')).toHaveLength(1);
    expect(tab.log).toContain(shell);
    expect(shell.running).toBe(true);
    expect(tab.runtime?.acpRoles?.ask?.prompt).toBeUndefined();
    expect(managers.acpRecords.rows()[0].status).toBe('Closed');
    expect(managers.acpRecords.window(managers.acpRecords.rows()[0].id)?.blocks).toMatchObject([{ answer: 'ACP session closed.' }]);
  });

  it('settles a pending shell prompt once when it is cancelled', async () => {
    const { managers } = setup();
    await managers.command.dispatchLineWithOutput('consumer', 'ask held', 1);
    await expect(managers.acp.cancel('consumer')).resolves.toBe(true);

    await vi.waitFor(() => {
      const replies = managers.tab.byLabel('consumer')!.log.filter((entry) => entry.background);
      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({ input: 'ask held', output: 'ACP: prompt cancelled.' });
    });
    managers.acp.closeAll();
  });

  it('settles a pending shell prompt once when cancellation cannot be sent', async () => {
    const { managers, session } = setup();
    await managers.command.dispatchLineWithOutput('consumer', 'ask held', 1);
    session.cancel.mockRejectedValue(new Error('write failed'));
    await expect(managers.acp.cancel('consumer')).resolves.toBe(true);

    await vi.waitFor(() => {
      const replies = managers.tab.byLabel('consumer')!.log.filter((entry) => entry.background);
      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({ input: 'ask held', output: 'ACP: cancellation failed: write failed' });
    });
    managers.acp.closeAll();
  });

  it('settles a pending shell prompt once when close wins a cancellation race', async () => {
    const { managers, session } = setup();
    await managers.command.dispatchLineWithOutput('consumer', 'ask held', 1);
    const drain = Promise.withResolvers<void>();
    session.cancel.mockReturnValue(drain.promise);
    const cancel = managers.acp.cancel('consumer');
    managers.acp.close('consumer');
    drain.resolve();

    await expect(cancel).resolves.toBe(true);
    await vi.waitFor(() => {
      const replies = managers.tab.byLabel('consumer')!.log.filter((entry) => entry.background);
      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({ input: 'ask held', output: 'ACP session closed.' });
    });
    managers.acp.closeAll();
  });

  it('ignores a late prompt error after close settled the one background reply', async () => {
    const { managers, handlers } = setup();
    await managers.command.dispatchLineWithOutput('consumer', 'ask held', 1);
    managers.acp.close('consumer');
    handlers().onError('late failure');

    await vi.waitFor(() => {
      const replies = managers.tab.byLabel('consumer')!.log.filter((entry) => entry.background);
      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({ input: 'ask held', output: 'ACP session closed.' });
    });
    managers.acp.closeAll();
  });

  it.each([true, false])('reset cancels only its own question (ACP queued: %s)', async (queued) => {
    const { managers, handlers, session } = setup();
    const askOther = () => managers.questions.register({ tab: 'consumer', kind: 'ask', question: 'Other request' });
    let other = queued ? askOther() : undefined;
    const pending = managers.acp.prompt('consumer', 'ask ask me');
    handlers().onChunk('question ask "ACP request"');
    handlers().onEnd('end_turn');
    other ??= askOther();
    managers.acp.close('consumer');
    await expect(pending).resolves.toBe('ACP session closed.');
    expect(managers.questions.pendingFor('consumer')?.question).toBe('Other request');
    const id = managers.questions.pendingFor('consumer')!.id;
    expect(managers.questions.answer('consumer', id, 'Answer')).toBe(true);
    await expect(other).resolves.toBe('Answer');
    expect(managers.questions.pendingFor('consumer')).toBeUndefined();
    expect(session.prompt).toHaveBeenCalledTimes(1);
    expect(session.kill).toHaveBeenCalledTimes(1);
  });

  it('does not register an already cancelled question', async () => {
    const { managers } = setup();
    const abort = new AbortController();
    abort.abort();
    await expect(managers.questions.register({ tab: 'consumer', kind: 'ask', question: 'Cancelled' }, abort.signal)).resolves.toBe(QUESTION_CANCELLED);
    expect(managers.questions.pendingFor('consumer')).toBeUndefined();
  });

  it('binds capabilities to the owning plugin tab and exempts provider wait time', async () => {
    const { managers, handlers } = setup();
    const declaration = managers.plugins.declarations[0];
    const invalid = acpCapabilities({ managers, declaration, origin: { label: 'agent' }, isEnabled: () => true });
    expect(() => invalid.startAcp()).toThrow('ACP tab is unavailable.');
    const answering = guardPluginCall((deadline) => acpCapabilities({
      managers, declaration, origin: { label: 'agent' }, answeringLabel: 'consumer', isEnabled: () => true, deadline,
    }).promptAcp('hello'), 10);
    await new Promise((resolve) => setTimeout(resolve, 25));
    handlers().onChunk('reply');
    handlers().onEnd('end_turn');
    await expect(answering).resolves.toBe('reply');
    managers.acp.closeAll();
  });

  // The summarizer's promised boundary, held by the host rather than asked of the model: a session
  // started without tools runs the real loop with no table behind it, so a reply that names a
  // browser, question, or database command is answered as prose and nothing is dispatched.
  it('refuses every tool for a plugin session started without them', async () => {
    const { managers, handlers } = setup();
    const declaration = managers.plugins.declarations[0];
    const capabilities = acpCapabilities({
      managers, declaration, origin: { label: 'agent' }, answeringLabel: 'consumer', isEnabled: () => true,
    });

    expect(capabilities.startAcp({ withoutTools: true }).model).toBeDefined();
    const answer = capabilities.promptAcp('summarize the open tabs');
    handlers().onChunk('Reading the output now.\nbrowser goto https://example.com');
    handlers().onEnd('end_turn');

    await expect(answer).resolves.toBe('Reading the output now.\nbrowser goto https://example.com');
    expect(managers.browser.run).not.toHaveBeenCalled();
    expect(managers.questions.pendingFor('consumer')).toBeUndefined();
  });

  // The contrast that makes the case above a regression test rather than a tautology: the same reply
  // on an ordinary session does reach the browser, so what stopped it was the session.
  it('still runs the tools for an ordinary plugin session', async () => {
    const { managers, handlers } = setup();
    const declaration = managers.plugins.declarations[0];
    const capabilities = acpCapabilities({
      managers, declaration, origin: { label: 'agent' }, answeringLabel: 'consumer', isEnabled: () => true,
    });

    capabilities.startAcp();
    const answer = capabilities.promptAcp('open the release page');
    handlers().onChunk('Opening it now.\nbrowser goto https://example.com');
    handlers().onEnd('end_turn');
    // The browser command ran, so the loop is on its follow-up turn rather than finished.
    handlers().onChunk('Done.');
    handlers().onEnd('end_turn');

    await expect(answer).resolves.toBe('Done.');
    expect(managers.browser.run).toHaveBeenCalledWith('consumer', 'browser goto https://example.com');
  });

  // A refusal resolves with a line of prose, so the caller is told which kind of line arrived rather
  // than left to read its text. The loop's own error path is the refusal a summarizer meets.
  it('answers a prompt the loop failed as a refusal, with the line the user is shown', async () => {
    const { managers, handlers } = setup();
    const declaration = managers.plugins.declarations[0];
    const capabilities = acpCapabilities({
      managers, declaration, origin: { label: 'agent' }, answeringLabel: 'consumer', isEnabled: () => true,
    });

    capabilities.startAcp({ withoutTools: true });
    const answer = capabilities.promptAcpResult('summarize the open tabs');
    handlers().onChunk('partial');
    handlers().onError('rate limited');

    await expect(answer).resolves.toEqual({ answered: false, error: 'ACP error: rate limited' });
  });

  // A tab's session is replaced whenever the old one dies, and the successor arrives with nothing the
  // previous one was primed with. The identity is what lets a caller see it.
  it('reports a different session after the one it primed is replaced', async () => {
    const { managers, handlers } = setup();
    const declaration = managers.plugins.declarations[0];
    const capabilities = acpCapabilities({
      managers, declaration, origin: { label: 'agent' }, answeringLabel: 'consumer', isEnabled: () => true,
    });
    const first = capabilities.startAcp({ withoutTools: true });

    const primed = capabilities.promptAcpResult('priming');
    handlers().onChunk('primed');
    handlers().onEnd('end_turn');
    await expect(primed).resolves.toMatchObject({ answered: true, session: first.session });

    managers.acp.close('consumer');
    const second = capabilities.startAcp({ withoutTools: true });
    expect(second.session).not.toBe(first.session);

    const answered = capabilities.promptAcpResult('summarize the open tabs');
    handlers().onChunk('[[tab:shell]] First.');
    handlers().onEnd('end_turn');

    await expect(answered).resolves.toMatchObject({ answered: true, session: second.session });
  });
});
