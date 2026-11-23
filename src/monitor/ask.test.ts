import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MonitorSub } from './live-monitors.js';
import type { Managers } from '../managers.js';
import type { MonitorContextEntry } from './context.js';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
}));

vi.mock('../notifications/index.js', () => ({
  notify: mocks.notify,
}));

import { askMonitor } from './ask.js';

type Call = Parameters<NonNullable<Managers['acp']['promptResult']>>;

function makeReg() {
  return {
    inline: true,
    name: 'test-persona',
    persona: { name: 'test-persona', role: 'tell', body: 'Watch for bugs.' },
    firstPrompt: 'persona primer',
    inFlight: false,
    contextBytes: 0,
    contextText: [] as MonitorContextEntry[],
  };
}

function setup() {
  const pending = Promise.withResolvers<Awaited<ReturnType<Managers['acp']['promptResult']>>>();
  const promptResult = vi.fn((..._args: Call) => pending.promise);
  const finishRunning = vi.fn();
  const startRunning = vi.fn();
  const managers = {
    acp: { promptResult },
    tab: { startRunning, finishRunning },
  } as unknown as Managers;
  return { managers, promptResult, finishRunning, startRunning, settle: pending.resolve, fail: pending.reject };
}

beforeEach(() => { mocks.notify.mockClear(); });

describe('askMonitor', () => {
  it('sends the question and persona primer through the core entry point under the persona role', async () => {
    const reg = makeReg();
    const { managers, promptResult, startRunning, settle } = setup();

    askMonitor(reg as unknown as MonitorSub, 'owner-tab', 'test-persona', 'test question', managers);

    expect(reg.inFlight).toBe(true);
    expect(startRunning).toHaveBeenCalledWith(
      'owner-tab', 'monitor ask test-persona test question', { background: expect.any(String) },
    );
    expect(promptResult).toHaveBeenCalledExactlyOnceWith(
      'owner-tab',
      expect.stringContaining('test question'),
      'tell',
      { appendRefusalToTranscript: false },
    );
    const prompt = promptResult.mock.calls[0][1];
    expect(prompt).toContain('persona primer');
    expect(prompt).toContain('Answer directly; the suggestion format does not apply to this reply.');
    expect(reg.contextText.map((entry) => entry.text)).toContain(prompt.replace('persona primer\n\n', ''));

    settle({ answered: true, reply: 'Nothing suspicious so far.', session: 's1' });
    await vi.waitFor(() => { expect(reg.inFlight).toBe(false); });
  });

  it('finishes the running entry with the reply and clears the primer for later prompts', async () => {
    const reg = makeReg();
    const { managers, finishRunning, settle } = setup();

    askMonitor(reg as unknown as MonitorSub, 'owner-tab', 'test-persona', 'test question', managers);
    settle({ answered: true, reply: 'Nothing suspicious so far.', session: 's1' });
    await vi.waitFor(() => { expect(finishRunning).toHaveBeenCalled(); });

    expect(finishRunning).toHaveBeenCalledExactlyOnceWith(
      'owner-tab',
      '💡 test-persona: Nothing suspicious so far.',
      { command: 'monitor ask test-persona test question' },
    );
    expect(reg.firstPrompt).toBe('');
    expect(reg.contextText.at(-1)).toEqual({ role: 'response', text: 'Nothing suspicious so far.' });
  });

  it('uses the monitor error line for a core refusal without respawning anything', async () => {
    const reg = makeReg();
    const { managers, finishRunning, settle } = setup();

    askMonitor(reg as unknown as MonitorSub, 'owner-tab', 'test-persona', 'test question', managers);
    settle({ answered: false, error: 'ACP: a prompt is already running.' });
    await vi.waitFor(() => { expect(finishRunning).toHaveBeenCalled(); });

    expect(finishRunning).toHaveBeenCalledExactlyOnceWith(
      'owner-tab',
      'monitor test-persona: ACP: a prompt is already running. — restarting monitor session',
      { command: 'monitor ask test-persona test question' },
    );
    expect(reg.inFlight).toBe(false);
    expect(reg.firstPrompt).toBe('persona primer');
  });

  it('fires a rate-limited notification on a rate-limit-shaped refusal', async () => {
    const reg = makeReg();
    const { managers, settle } = setup();

    askMonitor(reg as unknown as MonitorSub, 'owner-tab', 'test-persona', 'test question', managers);
    settle({ answered: false, error: '429 too many requests' });
    await vi.waitFor(() => { expect(mocks.notify).toHaveBeenCalled(); });

    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(managers, 'rate-limited', 'owner-tab');
  });

  it('does not fire a rate-limited notification on an unrelated refusal', async () => {
    const reg = makeReg();
    const { managers, settle } = setup();

    askMonitor(reg as unknown as MonitorSub, 'owner-tab', 'test-persona', 'test question', managers);
    settle({ answered: false, error: 'connection refused' });
    await vi.waitFor(() => { expect(reg.inFlight).toBe(false); });

    expect(mocks.notify).not.toHaveBeenCalledWith(managers, 'rate-limited', 'owner-tab');
  });

  it('finishes the running entry for a rejected prompt', async () => {
    const reg = makeReg();
    const { managers, finishRunning, fail } = setup();

    askMonitor(reg as unknown as MonitorSub, 'owner-tab', 'test-persona', 'test question', managers);
    fail(new Error('spawn failed'));
    await vi.waitFor(() => { expect(finishRunning).toHaveBeenCalled(); });

    expect(finishRunning).toHaveBeenCalledExactlyOnceWith(
      'owner-tab',
      'monitor test-persona: spawn failed — restarting monitor session',
      { command: 'monitor ask test-persona test question' },
    );
    expect(reg.inFlight).toBe(false);
  });
});
