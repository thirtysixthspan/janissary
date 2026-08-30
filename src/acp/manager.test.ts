import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AcpSession, AcpLoopDeps, AcpLoopHandlers } from './types.js';

const mocks = vi.hoisted(() => ({
  connectAcp: vi.fn(),
  runAcpToolLoop: vi.fn(),
  makeUpdateRunning: vi.fn(),
  messageBusEmit: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('../notifications.js', () => ({
  notify: mocks.notify,
}));
vi.mock('./index.js', () => ({
  connectAcp: mocks.connectAcp,
}));
vi.mock('./loop.js', () => ({
  runAcpToolLoop: mocks.runAcpToolLoop,
}));
vi.mock('./runner.js', () => ({
  makeUpdateRunning: mocks.makeUpdateRunning,
}));
vi.mock('../bus.js', () => ({
  messageBus: { emit: mocks.messageBusEmit },
}));
vi.mock('../browser/command.js', () => ({
  extractBrowserCommand: vi.fn(),
  BROWSER_PRIMER: 'browser primer text',
}));

import { AcpManager } from './manager.js';

const makeSession = (): AcpSession => ({ prompt: vi.fn(), kill: vi.fn() });

const setup = () => {
  mocks.connectAcp.mockReturnValue(makeSession());
  mocks.makeUpdateRunning.mockReturnValue(vi.fn());
  const append = vi.fn();
  const addBusy = vi.fn();
  const deleteBusy = vi.fn();
  const registerQuestion = vi.fn(async () => 'Production');
  const managers = {
    tab: {
      tabs: [],
      append,
      cwdOf: vi.fn().mockReturnValue('/cwd'),
      addBusy,
      deleteBusy,
      persist: vi.fn(),
      buildAgentState: vi.fn(),
    },
    database: {
      primer: 'db primer',
      runInTab: vi.fn(),
      extract: vi.fn(),
    },
    browser: { run: vi.fn() },
    questions: { register: registerQuestion },
  } as never;
  const acp = new AcpManager(managers);
  return { acp, append, addBusy, deleteBusy, managers, registerQuestion };
};

describe('AcpManager.run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows usage when the command has no prompt after stripping acp prefix', () => {
    const { acp, append } = setup();
    acp.run('tab1', 'acp');
    expect(append).toHaveBeenCalledWith('tab1', { input: 'acp', output: 'Usage: acp <prompt>.' });
    expect(mocks.connectAcp).not.toHaveBeenCalled();
  });

  it('creates a session and wires runAcpToolLoop with the prompt, primer, and callbacks', () => {
    const { acp, managers } = setup();
    acp.run('tab1', 'acp hello world');
    expect(mocks.connectAcp).toHaveBeenCalledOnce();
    expect(mocks.makeUpdateRunning).toHaveBeenCalledWith('tab1', managers);
    expect(mocks.runAcpToolLoop).toHaveBeenCalledOnce();
    const deps = mocks.runAcpToolLoop.mock.calls[0][2] as Record<string, unknown>;
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    expect(mocks.runAcpToolLoop.mock.calls[0][1]).toBe('hello world');
    expect(typeof (deps as Record<string, unknown>).primer).toBe('string');
    expect(typeof handlers.startTurn).toBe('function');
    expect(typeof handlers.finished).toBe('function');
    expect(typeof handlers.error).toBe('function');
  });

  it('runs an agent-issued question command and returns the human answer', async () => {
    const { acp, registerQuestion } = setup();
    acp.run('tab1', 'acp plan the release');
    const dependencies = mocks.runAcpToolLoop.mock.calls[0][2] as AcpLoopDeps;

    expect(dependencies.primer).toContain('question ask "<question>"');
    expect(dependencies.extractCommand('question ask "What port?"')).toBe('question ask "What port?"');
    await expect(dependencies.runCommand(
      'question approve "Deploy?" Staging Production',
    )).resolves.toBe('Production');
    expect(registerQuestion).toHaveBeenCalledWith({
      tab: 'tab1',
      kind: 'approve',
      question: 'Deploy?',
      options: ['Staging', 'Production'],
    });
  });

  it('error handler updates output, cleans up busy, and calls onDone', () => {
    const { acp, deleteBusy } = setup();
    const updateFn = vi.fn();
    mocks.makeUpdateRunning.mockReturnValue(updateFn);
    const onDone = vi.fn();
    acp.run('tab1', 'acp hello', onDone);
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.error('something failed');
    expect(updateFn).toHaveBeenCalledWith('ACP error: something failed', false);
    expect(deleteBusy).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledWith('ACP error: something failed');
  });

  it('finished handler cleans up busy and calls onDone with the last answer when reason is answered', () => {
    const { acp, deleteBusy } = setup();
    const onDone = vi.fn();
    acp.run('tab1', 'acp hello', onDone);
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.endTurn('the final answer');
    handlers.finished('answered', 8);
    expect(deleteBusy).toHaveBeenCalledOnce();
    expect(mocks.messageBusEmit).toHaveBeenCalledWith('state', { type: 'dirty' });
    expect(onDone).toHaveBeenCalledWith('the final answer');
  });

  it('finished handler appends a capped message when reason is capped', () => {
    const { acp, append } = setup();
    acp.run('tab1', 'acp hello');
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.endTurn('partial');
    handlers.finished('capped', 5);
    expect(append).toHaveBeenCalledWith('tab1', { input: '', output: '(stopped after 5 tool steps)' });
  });

  it('startTurn calls addBusy and appends the prompt on first turn', () => {
    const { acp, addBusy, append } = setup();
    acp.run('tab1', 'acp hello');
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.startTurn(true);
    expect(addBusy).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledWith('tab1', { input: 'hello', output: '', running: true, markdown: true });
  });

  it('startTurn fires an agent-start notification on the first turn only', () => {
    const { acp, managers } = setup();
    acp.run('tab1', 'acp hello');
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.startTurn(true);
    expect(mocks.notify).toHaveBeenCalledWith(managers, 'agent-start', 'tab1');
    mocks.notify.mockClear();
    handlers.startTurn(false);
    expect(mocks.notify).not.toHaveBeenCalledWith(managers, 'agent-start', 'tab1');
  });

  it('finished fires a state-change notification', () => {
    const { acp, managers } = setup();
    acp.run('tab1', 'acp hello');
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.finished('answered', 8);
    expect(mocks.notify).toHaveBeenCalledWith(managers, 'state-change', 'tab1');
  });

  it('error fires a state-change notification', () => {
    const { acp, managers } = setup();
    acp.run('tab1', 'acp hello');
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.error('boom');
    expect(mocks.notify).toHaveBeenCalledWith(managers, 'state-change', 'tab1');
  });

  it('error with a rate-limit-shaped message also fires a rate-limited notification', () => {
    const { acp, managers } = setup();
    acp.run('tab1', 'acp hello');
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.error('request failed with status 429');
    expect(mocks.notify).toHaveBeenCalledWith(managers, 'state-change', 'tab1');
    expect(mocks.notify).toHaveBeenCalledWith(managers, 'rate-limited', 'tab1');
  });

  it('error with an unrelated message does not fire a rate-limited notification', () => {
    const { acp, managers } = setup();
    acp.run('tab1', 'acp hello');
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.error('boom');
    expect(mocks.notify).not.toHaveBeenCalledWith(managers, 'rate-limited', 'tab1');
  });

  it('an answered reply whose text is rate-limit-shaped fires a rate-limited notification', () => {
    const { acp, managers } = setup();
    acp.run('tab1', 'acp hello');
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.endTurn('Error: 429 Too Many Requests. Please try again later.');
    handlers.finished('answered', 8);
    expect(mocks.notify).toHaveBeenCalledWith(managers, 'rate-limited', 'tab1');
  });

  it('an answered reply with ordinary text does not fire a rate-limited notification', () => {
    const { acp, managers } = setup();
    acp.run('tab1', 'acp hello');
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.endTurn('The actors are Keanu and Carrie.');
    handlers.finished('answered', 8);
    expect(mocks.notify).not.toHaveBeenCalledWith(managers, 'rate-limited', 'tab1');
  });

  it('chunk handler calls updateRunning with the buffer verbatim', () => {
    const { acp } = setup();
    const updateFn = vi.fn();
    mocks.makeUpdateRunning.mockReturnValue(updateFn);
    acp.run('tab1', 'acp hello');
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.chunk('response so far');
    expect(updateFn).toHaveBeenCalledWith('response so far', true);
  });

  it('chunk handler leaves an empty buffer unwrapped', () => {
    const { acp } = setup();
    const updateFn = vi.fn();
    mocks.makeUpdateRunning.mockReturnValue(updateFn);
    acp.run('tab1', 'acp hello');
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.chunk('');
    expect(updateFn).toHaveBeenCalledWith('', true);
  });

  it('endTurn handler calls updateRunning with the final text verbatim', () => {
    const { acp } = setup();
    const updateFn = vi.fn();
    mocks.makeUpdateRunning.mockReturnValue(updateFn);
    acp.run('tab1', 'acp hello');
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.endTurn('the final answer');
    expect(updateFn).toHaveBeenCalledWith('the final answer', false);
  });

  it('endTurn handler leaves an empty final string unwrapped', () => {
    const { acp } = setup();
    const updateFn = vi.fn();
    mocks.makeUpdateRunning.mockReturnValue(updateFn);
    acp.run('tab1', 'acp hello');
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.endTurn('');
    expect(updateFn).toHaveBeenCalledWith('', false);
  });

  it('ranCommand handler appends the command result to the tab', () => {
    const { acp, append } = setup();
    acp.run('tab1', 'acp hello');
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.ranCommand('db query', 'row1\nrow2');
    expect(append).toHaveBeenCalledWith('tab1', { input: 'db query', output: 'row1\nrow2', acp: true });
  });

  it('onConnect callback fires messageBus.emit on session connection', () => {
    const { acp } = setup();
    mocks.connectAcp.mockImplementation((opts: Record<string, unknown>) => {
      if (typeof opts.onConnect === 'function') opts.onConnect();
      return makeSession();
    });
    acp.run('tab1', 'acp hello');
    expect(mocks.messageBusEmit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });

  it('onError callback appends error to tab on session connection failure', () => {
    const { acp, append } = setup();
    mocks.connectAcp.mockImplementation((opts: Record<string, unknown>) => {
      if (typeof opts.onError === 'function') opts.onError('connection refused');
      return makeSession();
    });
    acp.run('tab1', 'acp hello');
    expect(append).toHaveBeenCalledWith('tab1', { input: '', output: 'ACP: connection refused' });
  });
});

describe('AcpManager.label', () => {
  it('returns undefined when no session exists for a tab', () => {
    const { acp } = setup();
    expect(acp.label('unknown')).toBeUndefined();
  });

  it('returns provider/model string when a session is connected', () => {
    const { acp } = setup();
    mocks.connectAcp.mockImplementation((opts: Record<string, unknown>) => {
      if (typeof opts.onConnect === 'function') opts.onConnect();
      return makeSession();
    });
    acp.run('tab1', 'acp hello');
    expect(acp.label('tab1')).toContain('/');
  });
});

describe('AcpManager.close', () => {
  it('returns false when no session exists', () => {
    const { acp } = setup();
    expect(acp.close('nonexistent')).toBe(false);
  });

  it('closes the session and returns true', () => {
    const { acp } = setup();
    acp.run('tab1', 'acp hello');
    expect(acp.close('tab1')).toBe(true);
    expect(acp.has('tab1')).toBe(false);
  });
});

// A remote agent tab runs its agent on the far side, inside the workspace clone that host
// provisioned. Only where the session comes from changes; the tool loop and everything built on it
// never learn that it is remote.
describe('AcpManager — remote agent tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function remoteSetup(options: { attached?: boolean; channel?: boolean } = {}) {
    const base = setup();
    const managers = base.managers as unknown as {
      tab: { tabs: unknown[] };
      remote: { get: (label: string) => unknown };
    };
    managers.tab.tabs.push({ label: 'tab1', remote: { address: 'devbox', host: 'devbox' } });
    const channel = {
      attached: options.attached ?? true,
      send: vi.fn(),
      attachAcp: vi.fn(),
      detachAcp: vi.fn(),
    };
    managers.remote = { get: vi.fn(() => (options.channel === false ? undefined : channel)) };
    return { ...base, channel };
  }

  // The listener the adapter registered for its session id — the callbacks the remote's frames feed.
  function acpListener(channel: { attachAcp: ReturnType<typeof vi.fn> }) {
    return channel.attachAcp.mock.calls[0][1] as {
      onReady: () => void;
      onChunk: (text: string) => void;
      onEnd: (stopReason: string) => void;
      onError: (message: string, fatal: boolean) => void;
    };
  }

  it('backs the session with the channel and never spawns an agent locally', () => {
    const { acp, channel } = remoteSetup();

    acp.run('tab1', 'acp hello');

    expect(mocks.connectAcp).not.toHaveBeenCalled();
    expect(channel.attachAcp).toHaveBeenCalledOnce();
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'acp-open', command: 'opencode', args: ['acp'],
    }));
    expect(mocks.runAcpToolLoop).toHaveBeenCalledOnce();
    expect(acp.has('tab1')).toBe(true);
  });

  // The model is chosen here and sent across, so a remote session cannot silently disagree with a
  // local one about which model it is running.
  it('sends the locally chosen model across on the open frame', () => {
    const { acp, channel } = remoteSetup();

    acp.run('tab1', 'acp hello');

    const open = channel.send.mock.calls[0][0] as { env: Record<string, string> };
    expect(JSON.parse(open.env.OPENCODE_CONFIG_CONTENT)).toEqual({ model: 'google/gemini-3.1-flash-lite' });
  });

  // What the agent reports as its "model" is really the session's current mode name, so the popup
  // keeps reading the constant the local side chose — on both paths.
  it('reports the configured model in the connection label, not a mode name', () => {
    const { acp, channel } = remoteSetup();
    acp.run('tab1', 'acp hello');

    acpListener(channel).onReady();

    expect(acp.label('tab1')).toBe('google/gemini-3.1-flash-lite');
    expect(mocks.messageBusEmit).toHaveBeenCalledWith('state', { type: 'dirty' });
  });

  // The channel entry exists well before ssh has authenticated, and `send` drops every frame until
  // then — so a prompt now would hang forever with the busy dot lit and nothing to show for it.
  it('refuses a prompt while the channel is still connecting, starting nothing', () => {
    const { acp, append, addBusy, channel } = remoteSetup({ attached: false });
    const onDone = vi.fn();

    acp.run('tab1', 'acp hello', onDone);

    expect(append).toHaveBeenCalledWith('tab1', {
      input: 'acp hello', output: 'ACP: the remote session is still connecting.',
    });
    expect(onDone).toHaveBeenCalledWith('ACP: the remote session is still connecting.');
    expect(addBusy).not.toHaveBeenCalled();
    expect(mocks.runAcpToolLoop).not.toHaveBeenCalled();
    expect(channel.attachAcp).not.toHaveBeenCalled();
    expect(acp.has('tab1')).toBe(false);
  });

  it('retrying once the channel has attached then works', () => {
    const { acp, channel } = remoteSetup({ attached: false });
    acp.run('tab1', 'acp hello');

    channel.attached = true;
    acp.run('tab1', 'acp hello');

    expect(channel.attachAcp).toHaveBeenCalledOnce();
    expect(mocks.runAcpToolLoop).toHaveBeenCalledOnce();
  });

  it('falls back to a local session for a remote tab with no channel at all', () => {
    const { acp } = remoteSetup({ channel: false });

    expect(() => { acp.run('tab1', 'acp hello'); }).not.toThrow();
    expect(mocks.connectAcp).toHaveBeenCalledOnce();
  });

  it('leaves a local tab entirely unchanged', () => {
    const { acp } = setup();

    acp.run('tab1', 'acp hello');

    expect(mocks.connectAcp).toHaveBeenCalledOnce();
    expect(mocks.connectAcp.mock.calls[0][0]).toMatchObject({ cwd: '/cwd', command: 'opencode' });
  });

  // A dead session is reported and forgotten, so the next prompt spawns a fresh one rather than
  // writing into a corpse. A prompt that merely failed leaves the conversation intact.
  it('forgets the session on a fatal error and builds a fresh one for the next prompt', () => {
    const { acp, append, channel } = remoteSetup();
    acp.run('tab1', 'acp hello');

    acpListener(channel).onError('ACP agent exited.', true);

    expect(append).toHaveBeenCalledWith('tab1', { input: '', output: 'ACP: ACP agent exited.' });
    expect(acp.has('tab1')).toBe(false);
    expect(channel.send).toHaveBeenCalledWith({ type: 'acp-close', id: 'racp1' });

    acp.run('tab1', 'acp again');
    expect(channel.attachAcp).toHaveBeenCalledTimes(2);
    expect(channel.attachAcp.mock.calls[1][0]).toBe('racp2');
  });

  it('keeps the session alive on a non-fatal error, reporting it through the running prompt only', () => {
    const { acp, channel } = remoteSetup();
    acp.run('tab1', 'acp hello');
    const promptHandlers = { onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };
    acp.session('tab1', '/cwd', { onError: vi.fn(), onConnect: vi.fn() }).prompt('hi', promptHandlers);

    acpListener(channel).onError('rate limited', false);

    expect(promptHandlers.onError).toHaveBeenCalledWith('rate limited');
    expect(acp.has('tab1')).toBe(true);
  });

  it('streams chunks and the stop reason to the in-flight prompt', () => {
    const { acp, channel } = remoteSetup();
    acp.run('tab1', 'acp hello');
    const promptHandlers = { onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };
    acp.session('tab1', '/cwd', { onError: vi.fn(), onConnect: vi.fn() }).prompt('hi', promptHandlers);

    acpListener(channel).onChunk('partial ');
    acpListener(channel).onEnd('end_turn');

    expect(channel.send).toHaveBeenCalledWith({ type: 'acp-prompt', id: 'racp1', text: 'hi' });
    expect(promptHandlers.onChunk).toHaveBeenCalledWith('partial ');
    expect(promptHandlers.onEnd).toHaveBeenCalledWith('end_turn');
  });

  it('closing the tab\'s session sends the close frame and detaches the listener', () => {
    const { acp, channel } = remoteSetup();
    acp.run('tab1', 'acp hello');

    expect(acp.close('tab1')).toBe(true);

    expect(channel.send).toHaveBeenCalledWith({ type: 'acp-close', id: 'racp1' });
    expect(channel.detachAcp).toHaveBeenCalledWith('racp1');
  });
});
