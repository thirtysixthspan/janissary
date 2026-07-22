import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AcpSession, PromptHandlers } from '../types.js';
import type { Managers } from '../managers.js';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  listPersonas: vi.fn(),
  loadPersona: vi.fn(),
}));

vi.mock('../notifications.js', () => ({ notify: mocks.notify }));
vi.mock('../personas.js', () => ({ listPersonas: mocks.listPersonas, loadPersona: mocks.loadPersona }));

import { editorSuggest } from './handler.js';

function makeSession(): { session: AcpSession; prompt: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn> } {
  const prompt = vi.fn();
  const kill = vi.fn();
  return { session: { prompt, kill }, prompt, kill };
}

function makeManagers(session: ReturnType<typeof vi.fn>): Managers {
  return {
    tab: {
      tabs: [{ label: 'notes', editor: { url: '/open/1' } }],
      cur: () => ({ label: 'notes' }),
      cwdOf: () => '/repo',
    },
    editorAcp: { session },
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
    const managers = makeManagers(sessionFn);
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);

    expect(sessionFn).toHaveBeenCalledWith('notes', expect.objectContaining({ name: 'reviewer' }), '/repo', expect.objectContaining({ onError: expect.any(Function) }));
    expect(prompt).toHaveBeenCalledTimes(1);
    const [promptText, handlers] = prompt.mock.calls[0] as [string, PromptHandlers];
    expect(promptText).toContain('Watch for bugs.');
    expect(promptText).toContain('hello world');
    handlers.onChunk('[HUNK]\n[ANCHOR]: hello\n[REPLACEMENT]: goodbye\n[/HUNK]');
    handlers.onEnd('end_turn');

    expect(callback).toHaveBeenCalledWith({ hunks: [{ anchor: 'hello', replacement: 'goodbye' }] });
    expect(mocks.notify).not.toHaveBeenCalled();
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
