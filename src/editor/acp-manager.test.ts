import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as AcpIndex from '../acp/index.js';
import type { AcpSession } from '../acp/types.js';
import type { Persona } from '../personas.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

const ENTRY = { harness: 'opencode', model: 'model-x' };
const mocks = vi.hoisted(() => ({ connectAcp: vi.fn() }));
vi.mock('../acp/index.js', async (importOriginal) => ({
  ...await importOriginal<typeof AcpIndex>(), connectAcp: mocks.connectAcp,
}));

import { EditorAcpManager } from './acp-manager.js';
import { PersonaRoleSessionManager } from '../acp/persona-role-session.js';
import { messageBus } from '../bus.js';

type Hooks = { onError: (message: string) => void };

function makeSession(): { session: AcpSession; kill: ReturnType<typeof vi.fn> } {
  const kill = vi.fn();
  return {
    session: { prompt: vi.fn(), kill, cancel: async () => {}, shutdown: async () => {} },
    kill,
  };
}

function persona(name: string, role: string): Persona {
  return { name, role, body: 'Watch for bugs.' };
}

function harness(labels: string[] = ['notes']): {
  managers: Managers;
  editor: EditorAcpManager;
  tabs: Tab[];
} {
  const tabs = labels.map((label) => ({
    label, title: label, runtime: { busy: false, context: [], queue: [] },
  })) as unknown as Tab[];
  const managers = {
    tab: {
      tabs,
      byLabel: (label: string) => tabs.find((t) => t.label === label),
      cwdOf: () => '/repo',
    },
  } as unknown as Managers;
  managers.personaRoleSessions = new PersonaRoleSessionManager(managers);
  return { managers, editor: new EditorAcpManager(managers), tabs };
}

// Open a role slot on the shared core owner, then let the editor owner bind the persona to it.
function openSlot(
  managers: Managers, editor: EditorAcpManager, label: string, p: Persona, hooks?: Hooks,
): AcpSession {
  const bound = hooks ?? { onError: () => {} };
  const session = managers.personaRoleSessions.session(label, p.role, ENTRY, '/repo', bound);
  editor.session(label, p, p.role, '/repo', bound);
  return session;
}

function die(call: number, message: string): void {
  const options = mocks.connectAcp.mock.calls[call][0] as { onError: (message: string) => void };
  options.onError(message);
}

beforeEach(() => {
  vi.clearAllMocks();
  messageBus.clear();
});

describe('EditorAcpManager', () => {
  it('reuses the same core session for the same label and role', () => {
    mocks.connectAcp.mockReturnValue(makeSession().session);
    const { managers, editor } = harness();

    const first = openSlot(managers, editor, 'notes', persona('reviewer', 'research'));
    const second = openSlot(managers, editor, 'notes', persona('reviewer', 'research'));

    expect(first).toBe(second);
    expect(mocks.connectAcp).toHaveBeenCalledTimes(1);
  });

  it('gives two personas declaring different roles on one tab separate sessions', () => {
    mocks.connectAcp
      .mockReturnValueOnce(makeSession().session)
      .mockReturnValueOnce(makeSession().session);
    const { managers, editor } = harness();

    const reviewer = openSlot(managers, editor, 'notes', persona('reviewer', 'research'));
    const critic = openSlot(managers, editor, 'notes', persona('critic', 'planning'));

    expect(reviewer).not.toBe(critic);
    expect(mocks.connectAcp).toHaveBeenCalledTimes(2);
    expect(editor.hasSession('notes', 'research')).toBe(true);
    expect(editor.hasSession('notes', 'planning')).toBe(true);
  });

  it('opens a role slot without a persona-specific tool allowlist', () => {
    mocks.connectAcp.mockReturnValue(makeSession().session);
    const { managers, editor } = harness();

    openSlot(managers, editor, 'notes', persona('reviewer', 'research'));

    const options = mocks.connectAcp.mock.calls[0][0] as Record<string, unknown>;
    expect(options).not.toHaveProperty('allowedTools');
  });

  it('gives a different label its own session for the same role', () => {
    mocks.connectAcp
      .mockReturnValueOnce(makeSession().session)
      .mockReturnValueOnce(makeSession().session);
    const { managers, editor } = harness(['notes', 'todo']);

    openSlot(managers, editor, 'notes', persona('reviewer', 'research'));
    openSlot(managers, editor, 'todo', persona('reviewer', 'research'));

    expect(mocks.connectAcp).toHaveBeenCalledTimes(2);
  });

  it('connectionsFor reflects only open role slots and labels them with the persona name', () => {
    mocks.connectAcp
      .mockReturnValueOnce(makeSession().session)
      .mockReturnValueOnce(makeSession().session);
    const { managers, editor } = harness(['notes', 'todo']);

    openSlot(managers, editor, 'notes', persona('reviewer', 'research'));
    openSlot(managers, editor, 'todo', persona('critic', 'research'));

    expect(editor.connectionsFor('notes')).toEqual([
      { text: 'reviewer (acp)', kind: 'acp', acpRef: { scope: 'editor', label: 'notes', persona: 'reviewer' } },
    ]);
    expect(editor.connectionsFor('todo')).toEqual([
      { text: 'critic (acp)', kind: 'acp', acpRef: { scope: 'editor', label: 'todo', persona: 'critic' } },
    ]);
    expect(editor.connectionsFor('other')).toEqual([]);
  });

  it('hasSession reflects whether a slot is open, including after close/closeTab', () => {
    mocks.connectAcp.mockReturnValue(makeSession().session);
    const { managers, editor } = harness();

    expect(editor.hasSession('notes', 'research')).toBe(false);
    openSlot(managers, editor, 'notes', persona('reviewer', 'research'));
    expect(editor.hasSession('notes', 'research')).toBe(true);
    expect(editor.hasSession('notes', 'planning')).toBe(false);
    expect(editor.hasSession('todo', 'research')).toBe(false);

    editor.close('notes', 'reviewer');
    expect(editor.hasSession('notes', 'research')).toBe(false);

    openSlot(managers, editor, 'notes', persona('reviewer', 'research'));
    editor.closeTab('notes');
    expect(editor.hasSession('notes', 'research')).toBe(false);
  });

  it('close kills and removes just the matching persona slot', () => {
    const reviewer = makeSession();
    const critic = makeSession();
    mocks.connectAcp
      .mockReturnValueOnce(reviewer.session)
      .mockReturnValueOnce(critic.session);
    const { managers, editor } = harness();

    openSlot(managers, editor, 'notes', persona('reviewer', 'research'));
    openSlot(managers, editor, 'notes', persona('critic', 'planning'));

    expect(editor.close('notes', 'reviewer')).toBe(true);
    expect(reviewer.kill).toHaveBeenCalledTimes(1);
    expect(critic.kill).not.toHaveBeenCalled();
    expect(editor.connectionsFor('notes')).toEqual([
      { text: 'critic (acp)', kind: 'acp', acpRef: { scope: 'editor', label: 'notes', persona: 'critic' } },
    ]);
    expect(editor.close('notes', 'reviewer')).toBe(false);
  });

  it('closeTab closes every slot for that label only, and dispose clears the rest', () => {
    const notes = makeSession();
    const todo = makeSession();
    mocks.connectAcp
      .mockReturnValueOnce(notes.session)
      .mockReturnValueOnce(todo.session);
    const { managers, editor } = harness(['notes', 'todo']);

    openSlot(managers, editor, 'notes', persona('reviewer', 'research'));
    openSlot(managers, editor, 'todo', persona('reviewer', 'research'));
    editor.closeTab('notes');

    expect(notes.kill).toHaveBeenCalledTimes(1);
    expect(todo.kill).not.toHaveBeenCalled();
    expect(editor.connectionsFor('notes')).toEqual([]);
    expect(editor.connectionsFor('todo')).toHaveLength(1);

    editor.dispose();
    editor.dispose();
    expect(todo.kill).toHaveBeenCalledTimes(1);
    expect(editor.connectionsFor('todo')).toEqual([]);
    expect(editor.transcript('todo', 'reviewer')).toBe('');
  });

  it('record then transcript round-trips an exchange looked up by persona', () => {
    mocks.connectAcp.mockReturnValue(makeSession().session);
    const { managers, editor } = harness();
    openSlot(managers, editor, 'notes', persona('reviewer', 'research'));

    editor.record('notes', 'research', 'Review this diff', 'input');
    editor.record('notes', 'research', 'Looks good', 'response');

    const text = editor.transcript('notes', 'reviewer');
    expect(text).toContain('SENT TO MODEL');
    expect(text).toContain('Review this diff');
    expect(text).toContain('MODEL RESPONSE');
    expect(text).toContain('Looks good');
  });

  it('transcript is empty for an unknown persona and after close', () => {
    mocks.connectAcp.mockReturnValue(makeSession().session);
    const { managers, editor } = harness();
    expect(editor.transcript('notes', 'ghost')).toBe('');

    openSlot(managers, editor, 'notes', persona('reviewer', 'research'));
    editor.record('notes', 'research', 'hi', 'input');
    editor.close('notes', 'reviewer');
    expect(editor.transcript('notes', 'reviewer')).toBe('');
  });

  describe('when the agent dies', () => {
    it('forgets the slot without killing it, marks state dirty, and opens fresh next time', () => {
      const dead = makeSession();
      mocks.connectAcp
        .mockReturnValueOnce(dead.session)
        .mockReturnValueOnce(makeSession().session);
      const { managers, editor } = harness();
      const dirty = vi.fn();
      messageBus.on('state', 'dirty', dirty);
      openSlot(managers, editor, 'notes', persona('reviewer', 'research'));
      editor.record('notes', 'research', 'hi', 'input');

      die(0, 'ACP agent exited.');

      expect(editor.hasSession('notes', 'research')).toBe(false);
      expect(editor.connectionsFor('notes')).toEqual([]);
      expect(editor.transcript('notes', 'reviewer')).toBe('');
      expect(dead.kill).not.toHaveBeenCalled();
      expect(dirty).toHaveBeenCalledOnce();

      const next = openSlot(managers, editor, 'notes', persona('reviewer', 'research'));
      expect(mocks.connectAcp).toHaveBeenCalledTimes(2);
      expect(next).not.toBe(dead.session);
    });

    it('reports the death to the editor hook from the latest session() call, not the first', () => {
      mocks.connectAcp.mockReturnValue(makeSession().session);
      const { managers, editor } = harness();
      const first = vi.fn();
      const latest = vi.fn();
      const core = { onError: () => {} };
      const bind = (hooks: Hooks) => {
        managers.personaRoleSessions.session('notes', 'research', ENTRY, '/repo', core);
        editor.session('notes', persona('reviewer', 'research'), 'research', '/repo', hooks);
      };
      bind({ onError: first });
      bind({ onError: latest });

      die(0, 'ACP agent exited.');

      expect(first).not.toHaveBeenCalled();
      expect(latest).toHaveBeenCalledExactlyOnceWith('ACP agent exited.');
    });

    it('does not chain an earlier hook into a late error from a replaced slot', () => {
      mocks.connectAcp
        .mockReturnValueOnce(makeSession().session)
        .mockReturnValueOnce(makeSession().session);
      const { managers, editor } = harness();
      const onError = vi.fn();
      openSlot(managers, editor, 'notes', persona('reviewer', 'research'));
      editor.close('notes', 'reviewer');
      openSlot(managers, editor, 'notes', persona('reviewer', 'research'), { onError });

      die(0, 'ACP agent exited.');

      expect(editor.hasSession('notes', 'research')).toBe(true);
      expect(onError).not.toHaveBeenCalled();
    });
  });
});
