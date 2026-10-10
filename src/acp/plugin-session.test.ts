import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PromptHandlers } from './types.js';
import type { Managers } from '../managers.js';
import { TabManager } from '../tab/manager.js';
import { makeTab } from '../tab/index.js';
import { messageBus } from '../bus.js';
import { acpResponseFor } from './response.js';
import { acpCapabilities } from '../plugins/acp-capabilities.js';
import { guardPluginCall } from '../plugins/guard.js';
import { Questions, QUESTION_CANCELLED } from '../questions.js';
import { CommandManager } from '../command/manager.js';

const mock = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('./index.js', () => ({ connectAcp: mock.connect }));
vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));
import { AcpManager } from './manager.js';

function setup() {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  managers.questions = new Questions();
  managers.tab.tabs.push(makeTab('agent', '#fff'), {
    ...makeTab('consumer', '#abc'), view: 'plugin',
    plugin: { id: 'any-plugin', instanceKey: 'one', schemaVersion: 1, payload: {} },
  });
  let handlers: PromptHandlers | undefined;
  const session = { prompt: vi.fn((_text: string, next: PromptHandlers) => { handlers = next; }), kill: vi.fn() };
  mock.connect.mockImplementation((options: { onConnect(): void }) => { options.onConnect(); return session; });
  Object.assign(managers, {
    plugins: { declarations: [{ id: 'any-plugin', capabilities: ['startAcp', 'promptAcp', 'resetAcp'] }] },
    database: { primer: 'db', isCommandLine: () => false, openDbs: () => [] },
    browser: { run: vi.fn() },
    shell: { run: vi.fn((_label: string, _text: string, options: { onComplete(text: string): void }) => options.onComplete('ran')) },
  });
  managers.acp = new AcpManager(managers);
  managers.command = new CommandManager(managers);
  return { managers, session, handlers: () => handlers! };
}

afterEach(() => { vi.clearAllMocks(); messageBus.clear(); });

describe('core ACP for plugin tabs', () => {

  it('starts without a terminal, reuses the session, and projects only ACP entries', async () => {
    const { managers, handlers } = setup();
    expect(managers.acp.start('consumer').model).toBeDefined();
    const answer = managers.acp.prompt('consumer', 'acp hello');
    handlers().onChunk('# Partial');
    const tab = managers.tab.byLabel('consumer')!;
    managers.tab.append('consumer', { input: 'help', output: 'unrelated' });
    expect(acpResponseFor(tab)).toMatchObject({ running: true });
    expect(acpResponseFor(tab)?.lines.map((line) => line.text).join(' ')).toContain('# Partial');
    expect(acpResponseFor(tab)?.lines.map((line) => line.text).join(' ')).not.toContain('unrelated');
    handlers().onEnd('end_turn');
    await expect(answer).resolves.toBe('# Partial');
    expect(mock.connect).toHaveBeenCalledTimes(1);
    expect(acpResponseFor(tab)?.running).toBe(false);
    managers.acp.closeAll();
  });

  it('settles reset calls and ignores old chunks after a successor prompt starts', async () => {
    const { managers, handlers, session } = setup();
    const first = managers.acp.prompt('consumer', 'acp first');
    const old = handlers();
    managers.acp.close('consumer');
    await expect(first).resolves.toBe('ACP session closed.');
    const second = managers.acp.prompt('consumer', 'acp second');
    old.onChunk('obsolete');
    expect(acpResponseFor(managers.tab.byLabel('consumer')!)?.lines.some((line) => line.text.includes('obsolete'))).toBe(false);
    handlers().onChunk('new');
    handlers().onEnd('end_turn');
    await expect(second).resolves.toBe('new');
    expect(session.kill).toHaveBeenCalledTimes(1);
    managers.acp.closeAll();
  });

  it('rejects overlapping prompts without taking down the existing prompt', async () => {
    const { managers, handlers } = setup();
    const pending = managers.acp.prompt('consumer', 'acp first');
    await expect(managers.acp.prompt('consumer', 'acp second')).resolves.toBe('ACP: a prompt is already running.');
    handlers().onChunk('first answer');
    handlers().onEnd('end_turn');
    await expect(pending).resolves.toBe('first answer');
    managers.acp.closeAll();
  });

  it('waits for core streaming instead of returning a duplicate terminal reply', async () => {
    const { managers, handlers } = setup();
    const result = managers.command.dispatchLineWithOutput('consumer', 'acp hello', 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    handlers().onChunk('Answer');
    handlers().onEnd('end_turn');
    await expect(result).resolves.toEqual({ dispatched: true, output: '', coreResponse: true });
    expect(acpResponseFor(managers.tab.byLabel('consumer')!)?.lines.map((line) => line.text).join(' ')).toContain('Answer');
    managers.acp.closeAll();
  });

  it.each([true, false])('reset cancels only its own question (ACP queued: %s)', async (queued) => {
    const { managers, handlers, session } = setup();
    const askOther = () => managers.questions.register({ tab: 'consumer', kind: 'ask', question: 'Other request' });
    let other = queued ? askOther() : undefined;
    const pending = managers.acp.prompt('consumer', 'acp ask me');
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
    handlers().onChunk('Reading the output now.\nbrowser open https://example.com');
    handlers().onEnd('end_turn');

    await expect(answer).resolves.toBe('Reading the output now.\nbrowser open https://example.com');
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
    handlers().onChunk('Opening it now.\nbrowser open https://example.com');
    handlers().onEnd('end_turn');
    // The browser command ran, so the loop is on its follow-up turn rather than finished.
    handlers().onChunk('Done.');
    handlers().onEnd('end_turn');

    await expect(answer).resolves.toBe('Done.');
    expect(managers.browser.run).toHaveBeenCalledWith('consumer', 'browser open https://example.com');
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
