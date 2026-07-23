import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AcpSession, PromptHandlers } from '../types.js';
import type { Managers } from '../managers.js';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  listPersonas: vi.fn(),
  loadPersona: vi.fn(),
  spawnMonitorSession: vi.fn(),
}));

vi.mock('../notifications.js', () => ({ notify: mocks.notify }));
vi.mock('../personas.js', () => ({ listPersonas: mocks.listPersonas, loadPersona: mocks.loadPersona }));
vi.mock('../monitor/acp.js', () => ({ spawnMonitorSession: mocks.spawnMonitorSession }));

import { editorSuggest } from './handler.js';
import { EditorAcpManager } from '../editor/acp-manager.js';

function makeSession(): { session: AcpSession; prompt: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn> } {
  const prompt = vi.fn();
  const kill = vi.fn();
  return { session: { prompt, kill }, prompt, kill };
}

function makeManagers(session: ReturnType<typeof vi.fn>, record: ReturnType<typeof vi.fn> = vi.fn()): Managers {
  return {
    tab: {
      tabs: [{ label: 'notes', editor: { url: '/open/1' } }],
      cur: () => ({ label: 'notes' }),
      cwdOf: () => '/repo',
    },
    editorAcp: { session, record, hasSession: vi.fn(() => false) },
  } as unknown as Managers;
}

const baseParams = { url: '/open/1', persona: 'reviewer', content: 'hello world', prompt: 'rewrite this' };

describe('editorSuggest', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('notifies and returns no hunks for an unknown persona', () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    const managers = makeManagers(vi.fn());
    const callback = vi.fn();

    editorSuggest(managers, { ...baseParams, persona: 'ghostwriter' }, callback);

    expect(mocks.notify).toHaveBeenCalledWith(managers, 'editor-suggest', 'notes', 'ghostwriter: unknown persona');
    expect(callback).toHaveBeenCalledWith({ hunks: [] });
    expect(mocks.loadPersona).not.toHaveBeenCalled();
  });

  it('parses hunks from a happy-path reply, reusing the tab\'s persona session', () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', harness: { harness: 'claude', model: 'sonnet', variant: 'default' }, body: 'Watch for bugs.', tools: [] });
    const { session, prompt } = makeSession();
    const sessionFn = vi.fn(() => session);
    const record = vi.fn();
    const managers = makeManagers(sessionFn, record);
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);

    expect(sessionFn).toHaveBeenCalledWith('notes', expect.objectContaining({ name: 'reviewer' }), '/repo', expect.objectContaining({ onError: expect.any(Function) }));
    expect(prompt).toHaveBeenCalledTimes(1);
    const [promptText, handlers] = prompt.mock.calls[0] as [string, PromptHandlers];
    expect(promptText).toContain('Watch for bugs.');
    expect(promptText).toContain('hello world');
    expect(record).toHaveBeenCalledWith('notes', 'reviewer', promptText, 'input');
    handlers.onChunk('[HUNK]\n[ANCHOR]: hello\n[REPLACEMENT]: goodbye\n[/HUNK]');
    handlers.onEnd('end_turn');

    expect(record).toHaveBeenCalledWith('notes', 'reviewer', '[HUNK]\n[ANCHOR]: hello\n[REPLACEMENT]: goodbye\n[/HUNK]', 'response');
    expect(callback).toHaveBeenCalledWith({ hunks: [{ anchor: 'hello', replacement: 'goodbye' }] });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('records the exchange into the real EditorAcpManager so its transcript is non-empty afterward', () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', harness: { harness: 'claude', model: 'sonnet', variant: 'default' }, body: 'Watch for bugs.', tools: [] });
    const { session, prompt } = makeSession();
    mocks.spawnMonitorSession.mockReturnValue(session);
    const editorAcp = new EditorAcpManager({} as unknown as Managers);
    const managers = {
      tab: { tabs: [{ label: 'notes', editor: { url: '/open/1' } }], cur: () => ({ label: 'notes' }), cwdOf: () => '/repo' },
      editorAcp,
    } as unknown as Managers;

    expect(editorAcp.transcript('notes', 'reviewer')).toBe('');

    editorSuggest(managers, baseParams, vi.fn());
    const handlers = prompt.mock.calls[0][1] as PromptHandlers;
    handlers.onChunk('OK, nothing to change.');
    handlers.onEnd('end_turn');

    const transcript = editorAcp.transcript('notes', 'reviewer');
    expect(transcript).not.toBe('');
    expect(transcript).toContain('OK, nothing to change.');
  });

  it('a second request for the same persona reuses the same session (spawn called once)', () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', harness: { harness: 'claude', model: 'sonnet', variant: 'default' }, body: 'Watch for bugs.', tools: [] });
    const { session, prompt } = makeSession();
    const sessionFn = vi.fn(() => session);
    const managers = makeManagers(sessionFn);

    editorSuggest(managers, baseParams, vi.fn());
    (prompt.mock.calls[0][1] as PromptHandlers).onEnd('end_turn');
    editorSuggest(managers, baseParams, vi.fn());
    (prompt.mock.calls[1][1] as PromptHandlers).onEnd('end_turn');

    expect(sessionFn).toHaveBeenCalledTimes(2);
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it('only the first request in a tab/persona session primes with the persona body and hunk format; later requests send just the buffer and prompt', () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', harness: { harness: 'claude', model: 'sonnet', variant: 'default' }, body: 'Watch for bugs.', tools: [] });
    const { session, prompt } = makeSession();
    const hasSession = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const sessionFn = vi.fn(() => session);
    const record = vi.fn();
    const managers = {
      tab: { tabs: [{ label: 'notes', editor: { url: '/open/1' } }], cur: () => ({ label: 'notes' }), cwdOf: () => '/repo' },
      editorAcp: { session: sessionFn, record, hasSession },
    } as unknown as Managers;

    editorSuggest(managers, baseParams, vi.fn());
    (prompt.mock.calls[0][1] as PromptHandlers).onEnd('end_turn');
    editorSuggest(managers, baseParams, vi.fn());
    (prompt.mock.calls[1][1] as PromptHandlers).onEnd('end_turn');

    const firstPrompt = prompt.mock.calls[0][0] as string;
    const secondPrompt = prompt.mock.calls[1][0] as string;
    expect(firstPrompt).toContain('Watch for bugs.');
    expect(firstPrompt).toContain('Reply with zero or more proposed edits');
    expect(secondPrompt).not.toContain('Watch for bugs.');
    expect(secondPrompt).not.toContain('Reply with zero or more proposed edits');
    expect(secondPrompt).toContain('hello world');
    expect(secondPrompt).toContain('Request: rewrite this');
  });

  it('notifies and returns no hunks on a connect error', () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', harness: { harness: 'claude', model: 'sonnet', variant: 'default' }, body: 'Watch for bugs.', tools: [] });
    const { session } = makeSession();
    let capturedOnError: ((message: string) => void) | undefined;
    const sessionFn = vi.fn((_label, _persona, _cwd, hooks: { onError: (message: string) => void }) => {
      capturedOnError = hooks.onError;
      return session;
    });
    const managers = makeManagers(sessionFn);
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);
    capturedOnError?.('spawn failed');

    expect(mocks.notify).toHaveBeenCalledWith(managers, 'editor-suggest', 'notes', 'reviewer: spawn failed');
    expect(callback).toHaveBeenCalledWith({ hunks: [] });
  });

  it('notifies and returns no hunks on a prompt error, without killing the session', () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', harness: { harness: 'claude', model: 'sonnet', variant: 'default' }, body: 'Watch for bugs.', tools: [] });
    const { session, prompt, kill } = makeSession();
    const sessionFn = vi.fn(() => session);
    const managers = makeManagers(sessionFn);
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);
    const handlers = prompt.mock.calls[0][1] as PromptHandlers;
    handlers.onError('boom');

    expect(kill).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(managers, 'editor-suggest', 'notes', 'reviewer: boom');
    expect(callback).toHaveBeenCalledWith({ hunks: [] });
  });

  it('notifies "no suggestion" when the persona proposes nothing, without killing the session', () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', harness: { harness: 'claude', model: 'sonnet', variant: 'default' }, body: 'Watch for bugs.', tools: [] });
    const { session, prompt, kill } = makeSession();
    const sessionFn = vi.fn(() => session);
    const managers = makeManagers(sessionFn);
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);
    const handlers = prompt.mock.calls[0][1] as PromptHandlers;
    handlers.onChunk('OK, nothing to change.');
    handlers.onEnd('end_turn');

    expect(kill).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(managers, 'editor-suggest', 'notes', 'reviewer: no suggestion');
    expect(callback).toHaveBeenCalledWith({ hunks: [] });
  });
});
