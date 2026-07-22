import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AcpSession } from '../types.js';
import type { Persona } from '../personas.js';
import type { Managers } from '../managers.js';

const mocks = vi.hoisted(() => ({ spawnMonitorSession: vi.fn() }));
vi.mock('../monitor/acp.js', () => ({ spawnMonitorSession: mocks.spawnMonitorSession }));

import { EditorAcpManager } from './acp-manager.js';

function makeSession(): { session: AcpSession; kill: ReturnType<typeof vi.fn> } {
  const kill = vi.fn();
  return { session: { prompt: vi.fn(), kill }, kill };
}

function persona(name: string): Persona {
  return { name, harness: { harness: 'claude', model: 'sonnet', variant: 'default' }, body: 'Watch for bugs.', tools: [] };
}

describe('EditorAcpManager', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('spawns once and reuses the same session for the same label/persona', () => {
    const { session } = makeSession();
    mocks.spawnMonitorSession.mockReturnValue(session);
    const manager = new EditorAcpManager({} as Managers);

    const first = manager.session('notes', persona('reviewer'), '/repo', { onError: vi.fn() });
    const second = manager.session('notes', persona('reviewer'), '/repo', { onError: vi.fn() });

    expect(first).toBe(second);
    expect(mocks.spawnMonitorSession).toHaveBeenCalledTimes(1);
  });

  it('gives a different persona its own session', () => {
    mocks.spawnMonitorSession.mockReturnValueOnce(makeSession().session).mockReturnValueOnce(makeSession().session);
    const manager = new EditorAcpManager({} as Managers);

    manager.session('notes', persona('reviewer'), '/repo', { onError: vi.fn() });
    manager.session('notes', persona('critic'), '/repo', { onError: vi.fn() });

    expect(mocks.spawnMonitorSession).toHaveBeenCalledTimes(2);
  });

  it('gives a different label its own session for the same persona', () => {
    mocks.spawnMonitorSession.mockReturnValueOnce(makeSession().session).mockReturnValueOnce(makeSession().session);
    const manager = new EditorAcpManager({} as Managers);

    manager.session('notes', persona('reviewer'), '/repo', { onError: vi.fn() });
    manager.session('todo', persona('reviewer'), '/repo', { onError: vi.fn() });

    expect(mocks.spawnMonitorSession).toHaveBeenCalledTimes(2);
  });

  it('connectionsFor reflects only currently-open sessions', () => {
    mocks.spawnMonitorSession.mockReturnValueOnce(makeSession().session).mockReturnValueOnce(makeSession().session);
    const manager = new EditorAcpManager({} as Managers);
    manager.session('notes', persona('reviewer'), '/repo', { onError: vi.fn() });
    manager.session('todo', persona('critic'), '/repo', { onError: vi.fn() });

    expect(manager.connectionsFor('notes')).toEqual([{ text: 'reviewer (acp)', kind: 'acp' }]);
    expect(manager.connectionsFor('todo')).toEqual([{ text: 'critic (acp)', kind: 'acp' }]);
    expect(manager.connectionsFor('other')).toEqual([]);
  });

  it('close kills and removes just the matching session, returning whether one was open', () => {
    const { session: reviewerSession, kill: reviewerKill } = makeSession();
    const { session: criticSession, kill: criticKill } = makeSession();
    mocks.spawnMonitorSession.mockReturnValueOnce(reviewerSession).mockReturnValueOnce(criticSession);
    const manager = new EditorAcpManager({} as Managers);
    manager.session('notes', persona('reviewer'), '/repo', { onError: vi.fn() });
    manager.session('notes', persona('critic'), '/repo', { onError: vi.fn() });

    expect(manager.close('notes', 'reviewer')).toBe(true);

    expect(reviewerKill).toHaveBeenCalledTimes(1);
    expect(criticKill).not.toHaveBeenCalled();
    expect(manager.connectionsFor('notes')).toEqual([{ text: 'critic (acp)', kind: 'acp' }]);
    expect(manager.close('notes', 'reviewer')).toBe(false);
  });

  it('closeTab closes every session for that label only', () => {
    const { session: notesSession, kill: notesKill } = makeSession();
    const { session: todoSession, kill: todoKill } = makeSession();
    mocks.spawnMonitorSession.mockReturnValueOnce(notesSession).mockReturnValueOnce(todoSession);
    const manager = new EditorAcpManager({} as Managers);
    manager.session('notes', persona('reviewer'), '/repo', { onError: vi.fn() });
    manager.session('todo', persona('reviewer'), '/repo', { onError: vi.fn() });

    manager.closeTab('notes');

    expect(notesKill).toHaveBeenCalledTimes(1);
    expect(todoKill).not.toHaveBeenCalled();
    expect(manager.connectionsFor('notes')).toEqual([]);
    expect(manager.connectionsFor('todo')).toEqual([{ text: 'reviewer (acp)', kind: 'acp' }]);
  });
});
