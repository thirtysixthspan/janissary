import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as PersonaRole from '../acp/persona-role.js';
import type { Managers } from '../managers.js';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  listPersonas: vi.fn(),
  loadPersona: vi.fn(),
  promptPersonaRole: vi.fn(),
}));

vi.mock('../notifications/index.js', () => ({ notify: mocks.notify }));
vi.mock('../personas.js', () => ({ listPersonas: mocks.listPersonas, loadPersona: mocks.loadPersona }));
vi.mock('../acp/persona-role.js', async (importOriginal) => ({
  ...await importOriginal<typeof PersonaRole>(), promptPersonaRole: mocks.promptPersonaRole,
}));

import { editorSuggest } from './handler.js';
import { noEnabledModelsNotice, unknownRoleNotice } from '../acp/persona-role.js';

type PromptResult = { answered: boolean; reply?: string; error?: string; session?: string };

// An already-settled core result: the proxy exposes `then` without a thenable object literal, so the
// synchronous tests observe the reply without advancing the microtask queue.
function settled(result: PromptResult): unknown {
  return new Proxy({}, {
    get: (_target, key) => key === 'then'
      ? (callback: (value: PromptResult) => void) => { callback(result); }
      : undefined,
  });
}

function settleWith(result: PromptResult): void {
  mocks.promptPersonaRole.mockImplementation(() => settled(result));
}

function makeManagers(hasSession = false): {
  managers: Managers;
  session: ReturnType<typeof vi.fn>;
  record: ReturnType<typeof vi.fn>;
  hooks: { onError: (message: string) => void };
} {
  const tabs = [{ label: 'notes', editor: { url: '/open/1' } }];
  const session = vi.fn();
  const record = vi.fn();
  const hooks = { onError: () => {} };
  session.mockImplementation((_label, _persona, _role, _cwd, h: { onError: (message: string) => void }) => {
    hooks.onError = h.onError;
  });
  const managers = {
    tab: {
      tabs,
      byLabel: (label: string) => tabs.find((t) => t.label === label),
      editorTabByUrl: (url: string) => tabs.find((t) => t.editor?.url === url),
      cur: () => ({ label: 'notes' }),
      cwdOf: () => '/repo', workingDirOf: () => '/repo',
    },
    editorAcp: { session, record, hasSession: vi.fn(() => hasSession) },
  } as unknown as Managers;
  return { managers, session, record, hooks };
}

const baseParams = { url: '/open/1', persona: 'reviewer', content: 'hello world', prompt: 'rewrite this' };
const HUNK = '[HUNK]\n[ANCHOR]: hello\n[REPLACEMENT]: goodbye\n[/HUNK]';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listPersonas.mockReturnValue(['reviewer']);
  mocks.loadPersona.mockReturnValue({ name: 'reviewer', role: 'research', body: 'Watch for bugs.' });
  settleWith({ answered: true, reply: HUNK, session: 'persona-acp-1' });
});

describe('editorSuggest', () => {
  it('notifies and returns no hunks for an unknown persona', () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    const { managers } = makeManagers();
    const callback = vi.fn();

    editorSuggest(managers, { ...baseParams, persona: 'ghostwriter' }, callback);

    expect(mocks.notify).toHaveBeenCalledWith(managers, 'editor-suggest', 'notes', 'ghostwriter: unknown persona');
    expect(callback).toHaveBeenCalledWith({ hunks: [] });
    expect(mocks.loadPersona).not.toHaveBeenCalled();
    expect(mocks.promptPersonaRole).not.toHaveBeenCalled();
  });

  it('reaches the core role entry with the persona role and returns parsed hunks', () => {
    const { managers, record } = makeManagers();
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);

    expect(mocks.promptPersonaRole).toHaveBeenCalledWith(
      managers, 'notes', expect.any(String), 'research', 'reviewer',
    );
    const prompt = mocks.promptPersonaRole.mock.calls[0][2] as string;
    expect(prompt).toContain('Watch for bugs.');
    expect(prompt).toContain('Reply with zero or more proposed edits');
    expect(prompt).toContain('hello world');
    expect(record).toHaveBeenCalledWith('notes', 'research', prompt, 'input');
    expect(record).toHaveBeenCalledWith('notes', 'research', HUNK, 'response');
    expect(callback).toHaveBeenCalledWith({ hunks: [{ anchor: 'hello', replacement: 'goodbye' }] });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('primes only the first request; a later request sends only the buffer and request text', () => {
    const { managers } = makeManagers(true);

    editorSuggest(managers, baseParams, vi.fn());

    const prompt = mocks.promptPersonaRole.mock.calls[0][2] as string;
    expect(prompt).not.toContain('Watch for bugs.');
    expect(prompt).not.toContain('Reply with zero or more proposed edits');
    expect(prompt).toContain('hello world');
    expect(prompt).toContain('Request: rewrite this');
  });

  it('resolves a notification-only role failure with no hunks and no duplicate notification', () => {
    settleWith({ answered: false, error: unknownRoleNotice('reviewer', 'research') });
    const { managers } = makeManagers();
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);

    expect(callback).toHaveBeenCalledWith({ hunks: [] });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('resolves a no-enabled-models failure with no hunks and no duplicate notification', () => {
    settleWith({ answered: false, error: noEnabledModelsNotice('reviewer', 'research') });
    const { managers } = makeManagers();
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);

    expect(callback).toHaveBeenCalledWith({ hunks: [] });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('notifies with the core error on a prompt failure', () => {
    settleWith({ answered: false, error: 'boom' });
    const { managers, session } = makeManagers();
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);

    expect(mocks.notify).toHaveBeenCalledWith(managers, 'editor-suggest', 'notes', 'reviewer: boom');
    expect(callback).toHaveBeenCalledWith({ hunks: [] });
    expect(session).toHaveBeenCalledWith('notes', expect.objectContaining({ name: 'reviewer' }), 'research', '/repo', expect.objectContaining({ onError: expect.any(Function) }));
  });

  it('notifies "no suggestion" when the persona proposes nothing', () => {
    settleWith({ answered: true, reply: 'OK, nothing to change.', session: 'persona-acp-1' });
    const { managers } = makeManagers();
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);

    expect(mocks.notify).toHaveBeenCalledWith(managers, 'editor-suggest', 'notes', 'reviewer: no suggestion');
    expect(callback).toHaveBeenCalledWith({ hunks: [] });
  });

  it('reports an agent death after a settled reply once, without calling back again', () => {
    const { managers, hooks } = makeManagers();
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);
    hooks.onError('ACP agent exited.');

    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(managers, 'editor-suggest', 'notes', 'reviewer: ACP agent exited.');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not report an agent death a second time after the request already failed', () => {
    settleWith({ answered: false, error: 'connection closed' });
    const { managers, hooks } = makeManagers();
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);
    hooks.onError('ACP agent exited.');

    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(managers, 'editor-suggest', 'notes', 'reviewer: connection closed');
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
