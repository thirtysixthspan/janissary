import { describe, it, expect, vi } from 'vitest';
import { openMonitorSession, respawnMonitorSession } from './session.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { MonitorSub } from './manager.js';
import type { AcpSession, PromptHandlers } from '../types.js';
import type { Persona } from '../personas.js';

function makePersona(): Persona {
  return { name: 'reviewer', harness: { harness: 'claude', model: 'sonnet', variant: 'default' }, body: 'Watch for bugs.', tools: [] };
}

function makeSession(): { session: AcpSession; prompt: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn> } {
  const prompt = vi.fn();
  const kill = vi.fn();
  return { session: { prompt, kill }, prompt, kill };
}

function makeReg(overrides: Partial<MonitorSub> = {}): MonitorSub {
  return {
    owner: 'main',
    inline: true,
    persona: makePersona(),
    targets: [],
    buffer: [],
    session: makeSession().session,
    inFlight: false,
    delivered: 0,
    contextBytes: 0,
    contextText: [],
    timer: setInterval(() => {}, 1_000_000),
    subs: [],
    ...overrides,
  } as MonitorSub;
}

function makeManagers(cwd?: string): { managers: Managers; append: ReturnType<typeof vi.fn> } {
  const append = vi.fn();
  const managers = {
    tab: {
      cwdOf: vi.fn(() => cwd),
      append,
    },
  } as unknown as Managers;
  return { managers, append };
}

describe('openMonitorSession', () => {
  it('marks the registration in-flight and spawns a session with the tab cwd', () => {
    const reg = makeReg();
    const { managers } = makeManagers('/repo');
    const { session } = makeSession();
    const spawn = vi.fn(() => session);

    openMonitorSession(reg, managers, spawn);

    expect(reg.inFlight).toBe(true);
    expect(spawn).toHaveBeenCalledWith(reg.persona, '/repo', expect.objectContaining({
      onError: expect.any(Function),
      onConnect: expect.any(Function),
    }));
    expect(reg.session).toBe(session);
  });

  it('falls back to process.cwd() when the owner tab has no cwd', () => {
    const reg = makeReg();
    const { managers } = makeManagers(undefined);
    const spawn = vi.fn(() => makeSession().session);

    openMonitorSession(reg, managers, spawn);

    expect(spawn).toHaveBeenCalledWith(reg.persona, process.cwd(), expect.anything());
  });

  it('prompts the new session with the persona body and suggestion format', () => {
    const reg = makeReg();
    const { managers } = makeManagers('/repo');
    const { session, prompt } = makeSession();
    const spawn = vi.fn(() => session);

    openMonitorSession(reg, managers, spawn);

    expect(prompt).toHaveBeenCalledTimes(1);
    const [promptText, handlers] = prompt.mock.calls[0] as [string, PromptHandlers];
    expect(promptText).toContain('Watch for bugs.');
    expect(typeof handlers.onChunk).toBe('function');
    expect(typeof handlers.onEnd).toBe('function');
    expect(typeof handlers.onError).toBe('function');
  });

  it('clears in-flight when the prompt ends', () => {
    const reg = makeReg();
    const { managers } = makeManagers('/repo');
    const { session, prompt } = makeSession();
    const spawn = vi.fn(() => session);

    openMonitorSession(reg, managers, spawn);
    expect(reg.inFlight).toBe(true);

    const handlers = prompt.mock.calls[0][1] as PromptHandlers;
    handlers.onEnd('end_turn');
    expect(reg.inFlight).toBe(false);
  });

  it('clears in-flight when the prompt errors', () => {
    const reg = makeReg();
    const { managers } = makeManagers('/repo');
    const { session, prompt } = makeSession();
    const spawn = vi.fn(() => session);

    openMonitorSession(reg, managers, spawn);
    const handlers = prompt.mock.calls[0][1] as PromptHandlers;
    handlers.onError('boom');
    expect(reg.inFlight).toBe(false);
  });

  it('reports connection errors into the owner tab transcript', () => {
    const reg = makeReg({ owner: 'main' });
    const { managers, append } = makeManagers('/repo');
    let capturedOnError: ((message: string) => void) | undefined;
    const spawn = vi.fn((_persona, _cwd, hooks: { onError: (message: string) => void }) => {
      capturedOnError = hooks.onError;
      return makeSession().session;
    });

    openMonitorSession(reg, managers, spawn);
    capturedOnError?.('connection lost');

    expect(append).toHaveBeenCalledWith('main', { input: '', output: 'monitor reviewer: connection lost' });
  });

  it('records connection info, reports it in the owner tab, and emits a dirty state event on connect', () => {
    const reg = makeReg();
    const { managers, append } = makeManagers('/repo');
    const emitSpy = vi.spyOn(messageBus, 'emit');
    let capturedOnConnect: ((info: { provider?: string; model?: string }) => void) | undefined;
    const spawn = vi.fn((_persona, _cwd, hooks: { onConnect: (info: { provider?: string; model?: string }) => void }) => {
      capturedOnConnect = hooks.onConnect;
      return makeSession().session;
    });

    openMonitorSession(reg, managers, spawn);
    capturedOnConnect?.({ provider: 'anthropic', model: 'sonnet' });

    expect(reg.info).toEqual({ provider: 'anthropic', model: 'sonnet' });
    expect(append).toHaveBeenCalledWith('main', { input: '', output: 'monitor reviewer: connected (anthropic/sonnet) — Watch for bugs.' });
    expect(emitSpy).toHaveBeenCalledWith('state', { type: 'dirty' });
    emitSpy.mockRestore();
  });

  it('reports the connection without parens when no provider or model is known', () => {
    const reg = makeReg();
    const { managers, append } = makeManagers('/repo');
    let capturedOnConnect: ((info: { provider?: string; model?: string }) => void) | undefined;
    const spawn = vi.fn((_persona, _cwd, hooks: { onConnect: (info: { provider?: string; model?: string }) => void }) => {
      capturedOnConnect = hooks.onConnect;
      return makeSession().session;
    });

    openMonitorSession(reg, managers, spawn);
    capturedOnConnect?.({});

    expect(append).toHaveBeenCalledWith('main', { input: '', output: 'monitor reviewer: connected — Watch for bugs.' });
  });
});

describe('respawnMonitorSession', () => {
  it('kills the existing session and opens a new one', () => {
    const oldSession = makeSession();
    const reg = makeReg({ session: oldSession.session });
    const { managers } = makeManagers('/repo');
    const newSession = makeSession();
    const spawn = vi.fn(() => newSession.session);

    respawnMonitorSession(reg, managers, spawn);

    expect(oldSession.kill).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(reg.persona, '/repo', expect.anything());
    expect(reg.session).toBe(newSession.session);
    expect(reg.inFlight).toBe(true);
  });
});
