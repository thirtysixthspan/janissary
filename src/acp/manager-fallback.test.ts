import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcpLoopHandlers, AcpOptions, AcpSession } from './types.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import { makeTab } from '../tab/index.js';

const mocks = vi.hoisted(() => ({
  connectAcp: vi.fn(),
  runAcpToolLoop: vi.fn(),
}));

vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));
vi.mock('./index.js', () => ({ connectAcp: mocks.connectAcp }));
vi.mock('./loop.js', () => ({ runAcpToolLoop: mocks.runAcpToolLoop }));
vi.mock('../bus.js', () => ({ messageBus: { emit: vi.fn() } }));

import { AcpManager } from './manager.js';

const OPENCODE: RoleEntry = { harness: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: 'medium' };
const CLAUDE: RoleEntry = { harness: 'claude', model: 'claude-haiku-4-5', effort: 'high' };
const CODEX: RoleEntry = { harness: 'codex', model: 'gpt-6-luna', effort: 'high' };

const sessions: AcpSession[] = [];

function setup(entries: RoleEntry[] = [OPENCODE, CLAUDE, CODEX]) {
  mocks.connectAcp.mockImplementation(() => {
    const session: AcpSession = { prompt: vi.fn(), kill: vi.fn(), cancel: vi.fn(async () => {}), shutdown: vi.fn(async () => {}) };
    sessions.push(session);
    return session;
  });
  const tabs = [makeTab('tab1', '#fff')];
  const append = vi.fn();
  const managers = {
    acpRecords: { begin: vi.fn(() => 'record-id'), prompt: vi.fn(() => true), activity: vi.fn(), answer: vi.fn(), close: vi.fn() },
    tab: {
      tabs,
      launchDir: '/project',
      byLabel: (label: string) => tabs.find((tab) => tab.label === label),
      append,
      cwdOf: () => '/cwd',
      addBusy: vi.fn(),
      deleteBusy: vi.fn(),
      updateRunning: vi.fn(),
    },
    database: { primer: 'db primer', runInTab: vi.fn(), isCommandLine: vi.fn() },
    browser: { run: vi.fn() },
    questions: { register: vi.fn() },
  } as never;
  const askModels = vi.fn((_root: string) => entries);
  return { acp: new AcpManager(managers, askModels), append, askModels };
}

const launched = (call: number) => mocks.connectAcp.mock.calls[call][0] as AcpOptions;
const loop = (call: number) => mocks.runAcpToolLoop.mock.calls[call][3] as AcpLoopHandlers;
const answer = (handlers: AcpLoopHandlers, text: string) => {
  handlers.endTurn(text);
  handlers.finished('answered', 8);
};

describe('AcpManager — ask role fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessions.length = 0;
  });

  it('launches the role’s first entry for the first prompt, reading the role against the project root', () => {
    const { acp, askModels } = setup();

    acp.run('tab1', 'ask hello');

    expect(askModels).toHaveBeenCalledWith('/project');
    expect(mocks.connectAcp).toHaveBeenCalledOnce();
    expect(launched(0)).toMatchObject({ command: 'opencode', args: ['acp'] });
    expect(JSON.parse(launched(0).env!.OPENCODE_CONFIG_CONTENT)).toEqual({ model: OPENCODE.model });
  });

  it('moves to the next model when a prompt fails before any reply, and settles with its answer', () => {
    const { acp, append } = setup();
    const onDone = vi.fn();
    acp.run('tab1', 'ask hello', onDone);

    loop(0).error('out of credits');

    expect(sessions[0].kill).toHaveBeenCalled();
    expect(launched(1)).toMatchObject({ command: 'npx', args: ['@zed-industries/claude-code-acp'] });
    expect(launched(1).env).toEqual({ ANTHROPIC_MODEL: 'claude-haiku-4-5', CLAUDE_THINKING_EFFORT: 'high' });
    expect(append).toHaveBeenCalledWith('tab1', {
      input: '', output: 'ACP: opencode opencode-go/deepseek-v4.1-flash failed — trying claude claude-haiku-4-5.',
    });
    expect(onDone).not.toHaveBeenCalled();

    answer(loop(1), 'the answer');

    expect(onDone).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledWith({ answered: true, reply: 'the answer', session: expect.any(String) });
  });

  it('moves to the next model when the agent fails to start', () => {
    const { acp } = setup();
    acp.run('tab1', 'ask hello');

    launched(0).onError('failed to start ACP agent: missing credentials');

    expect(mocks.connectAcp).toHaveBeenCalledTimes(2);
    expect(launched(1).env).toMatchObject({ ANTHROPIC_MODEL: 'claude-haiku-4-5' });
    expect(acp.has('tab1')).toBe(true);
  });

  it('skips an entry whose harness has no ACP adapter without spawning anything for it', () => {
    const { acp, append } = setup([{ harness: 'gemini', model: 'gemini-3' }, OPENCODE]);

    acp.run('tab1', 'ask hello');

    expect(mocks.connectAcp).toHaveBeenCalledOnce();
    expect(launched(0).command).toBe('opencode');
    expect(append).toHaveBeenCalledWith('tab1', { input: 'ask hello', output: 'ACP error: no ACP adapter for harness "gemini".' });
  });

  it('fails the request only once every model in the role has failed, naming each attempt', () => {
    const { acp } = setup([OPENCODE, CLAUDE]);
    const onDone = vi.fn();
    acp.run('tab1', 'ask hello', onDone);

    loop(0).error('out of credits');
    expect(onDone).not.toHaveBeenCalled();
    loop(1).error('not authenticated');

    expect(onDone).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledWith({
      answered: false,
      error: [
        'ACP: every model in the ask role failed.',
        '- opencode opencode-go/deepseek-v4.1-flash: ACP error: out of credits',
        '- claude claude-haiku-4-5: ACP error: not authenticated',
      ].join('\n'),
    });
    expect(sessions[0].kill).toHaveBeenCalled();
    expect(sessions[1].kill).not.toHaveBeenCalled();
  });

  it('reports an error after the model has replied instead of retrying on another model', () => {
    const { acp } = setup();
    const onDone = vi.fn();
    acp.run('tab1', 'ask hello', onDone);

    loop(0).endTurn('db sqlite list');
    loop(0).error('boom');

    expect(mocks.connectAcp).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledWith({ answered: false, error: 'ACP error: boom' });
  });

  it('does not fall back when the prompt is cancelled', async () => {
    const { acp } = setup();
    const pending = acp.promptResult('tab1', 'ask hello');

    await acp.cancel('tab1');

    await expect(pending).resolves.toEqual({ answered: false, error: 'ACP: prompt cancelled.' });
    expect(mocks.connectAcp).toHaveBeenCalledOnce();
  });

  it('does not fall back when the session is reset', async () => {
    const { acp } = setup();
    const pending = acp.promptResult('tab1', 'ask hello');

    acp.close('tab1');

    await expect(pending).resolves.toEqual({ answered: false, error: 'ACP session closed.' });
    expect(mocks.connectAcp).toHaveBeenCalledOnce();
  });

  it('tries the tab’s open session first on a later request, then the role’s other models in order', () => {
    const { acp } = setup([OPENCODE, CLAUDE, CODEX]);
    acp.run('tab1', 'ask hello');
    loop(0).error('out of credits');
    answer(loop(1), 'from claude');

    acp.run('tab1', 'ask again');
    expect(mocks.connectAcp).toHaveBeenCalledTimes(2);
    loop(2).error('rate limited');

    expect(mocks.connectAcp).toHaveBeenCalledTimes(3);
    expect(launched(2).command).toBe('opencode');
  });

  it('starts the role’s first entry and reports its model', () => {
    const { acp } = setup([CLAUDE, OPENCODE]);

    expect(acp.start('tab1')).toEqual({ model: 'claude-haiku-4-5', session: expect.any(String) });
    expect(launched(0).env).toMatchObject({ ANTHROPIC_MODEL: 'claude-haiku-4-5' });
  });

  it('starts past an entry that cannot be launched', () => {
    const { acp } = setup([{ harness: 'gemini', model: 'gemini-3' }, CODEX]);

    expect(acp.start('tab1').model).toBe('gpt-6-luna');
    expect(launched(0).args).toEqual(['@zed-industries/codex-acp', '-c', 'model="gpt-6-luna"', '-c', 'model_reasoning_effort="high"']);
  });

  it('refuses when the ask role resolves to no models', () => {
    const { acp, append } = setup([]);
    const onDone = vi.fn();

    acp.run('tab1', 'ask hello', onDone);

    expect(onDone).toHaveBeenCalledWith({ answered: false, error: 'ACP: the ask role lists no models.' });
    expect(append).toHaveBeenCalledWith('tab1', { input: 'ask hello', output: 'ACP: the ask role lists no models.' });
    expect(acp.start('tab1')).toEqual({ error: 'ACP: the ask role lists no models.' });
    expect(mocks.connectAcp).not.toHaveBeenCalled();
  });
});
