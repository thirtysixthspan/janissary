import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AcpSession, AcpLoopHandlers } from '../types.js';

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
  } as never;
  const acp = new AcpManager(managers);
  return { acp, append, addBusy, deleteBusy, managers };
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

  it('chunk handler calls updateRunning with the buffer prefixed by the begin marker', () => {
    const { acp } = setup();
    const updateFn = vi.fn();
    mocks.makeUpdateRunning.mockReturnValue(updateFn);
    acp.run('tab1', 'acp hello');
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.chunk('response so far');
    expect(updateFn).toHaveBeenCalledWith('━━━━━━━━━━ BEGIN MODEL RESPONSE ━━━━━━━━━━\nresponse so far', true);
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

  it('endTurn handler calls updateRunning with both markers wrapped around the final text', () => {
    const { acp } = setup();
    const updateFn = vi.fn();
    mocks.makeUpdateRunning.mockReturnValue(updateFn);
    acp.run('tab1', 'acp hello');
    const handlers = mocks.runAcpToolLoop.mock.calls[0][3] as AcpLoopHandlers;
    handlers.endTurn('the final answer');
    expect(updateFn).toHaveBeenCalledWith(
      '━━━━━━━━━━ BEGIN MODEL RESPONSE ━━━━━━━━━━\nthe final answer\n━━━━━━━━━━ END MODEL RESPONSE ━━━━━━━━━━',
      false,
    );
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
