import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AcpPromptResult } from '../acp/types.js';
import type { Managers } from '../managers.js';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  listPersonas: vi.fn(),
  loadPersona: vi.fn(),
}));

vi.mock('../notifications/index.js', () => ({ notify: mocks.notify }));
vi.mock('../personas.js', () => ({ listPersonas: mocks.listPersonas, loadPersona: mocks.loadPersona }));

import { editorSuggest } from './handler.js';

type PromptResult = (
  label: string, command: string, role: string, options: { appendRefusalToTranscript: boolean },
) => Promise<AcpPromptResult>;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function answered(reply: string): AcpPromptResult {
  return { answered: true, reply, session: 'session-1' };
}
function refused(error: string): AcpPromptResult {
  return { answered: false, error };
}

function makeManagers(
  promptResult: PromptResult,
  isKnownModel: (harness: string, model: string) => boolean = () => true,
): Managers {
  const tabs = [{ label: 'notes', editor: { url: '/open/1' } }];
  return {
    tab: {
      tabs,
      byLabel: (label: string) => tabs.find((t) => t.label === label),
      editorTabByUrl: (url: string) => tabs.find((t) => t.editor?.url === url),
      cur: () => ({ label: 'notes' }),
      cwdOf: () => '/repo', workingDirOf: () => '/repo',
    },
    acp: { promptResult },
    models: { isKnownModel },
  } as unknown as Managers;
}

const baseParams = { url: '/open/1', persona: 'reviewer', content: 'hello world', prompt: 'rewrite this' };
const hunkReply = '[HUNK]\n[ANCHOR]: hello\n[REPLACEMENT]: goodbye\n[/HUNK]';

describe('editorSuggest', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('notifies and returns no hunks for an unknown persona', () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    const promptResult = vi.fn<PromptResult>(async () => answered(''));
    const managers = makeManagers(promptResult);
    const callback = vi.fn();

    editorSuggest(managers, { ...baseParams, persona: 'ghostwriter' }, callback);

    expect(mocks.notify).toHaveBeenCalledWith(managers, 'editor-suggest', 'notes', 'ghostwriter: unknown persona');
    expect(callback).toHaveBeenCalledWith({ hunks: [] });
    expect(mocks.loadPersona).not.toHaveBeenCalled();
    expect(promptResult).not.toHaveBeenCalled();
  });

  it('sends the query through the core prompt call with the persona body, hunk format, buffer and request', async () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', role: 'ask', body: 'Watch for bugs.' });
    const promptResult = vi.fn<PromptResult>(async () => answered(hunkReply));
    const managers = makeManagers(promptResult);
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);
    await settle();

    expect(promptResult).toHaveBeenCalledExactlyOnceWith(
      'notes', expect.any(String), 'ask', { appendRefusalToTranscript: false },
    );
    const fullPrompt = promptResult.mock.calls[0][1];
    expect(fullPrompt).toContain('Watch for bugs.');
    expect(fullPrompt).toContain('Reply with zero or more proposed edits');
    expect(fullPrompt).toContain('hello world');
    expect(fullPrompt).toContain('Request: rewrite this');
    expect(callback).toHaveBeenCalledWith({ hunks: [{ anchor: 'hello', replacement: 'goodbye' }] });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('passes the persona\'s resolved role to the core prompt call', async () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', role: 'tell', body: 'Watch for bugs.' });
    const promptResult = vi.fn<PromptResult>(async () => answered('OK'));
    const managers = makeManagers(promptResult);

    editorSuggest(managers, baseParams, vi.fn());
    await settle();

    expect(promptResult).toHaveBeenCalledExactlyOnceWith('notes', expect.any(String), 'tell', expect.anything());
  });

  it('filters role entries through the current model manager', async () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', role: 'ask', body: 'Watch for bugs.' });
    const isKnownModel = vi.fn(() => true);
    const promptResult = vi.fn<PromptResult>(async () => answered(hunkReply));
    const managers = makeManagers(promptResult, isKnownModel);

    editorSuggest(managers, baseParams, vi.fn());
    await settle();

    expect(isKnownModel).toHaveBeenCalled();
    expect(promptResult).toHaveBeenCalledTimes(1);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('notifies the exact unknown-role error and starts no prompt', async () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', role: 'ghost-role', body: 'Watch for bugs.' });
    const promptResult = vi.fn<PromptResult>(async () => answered(''));
    const managers = makeManagers(promptResult);
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);
    await settle();

    expect(mocks.notify).toHaveBeenCalledWith(
      managers, 'editor-suggest', 'notes', 'reviewer: Unknown role "ghost-role" in persona "reviewer".',
    );
    expect(callback).toHaveBeenCalledWith({ hunks: [] });
    expect(promptResult).not.toHaveBeenCalled();
  });

  it('notifies the no-models error before any prompt is started', async () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', role: 'ask', body: 'Watch for bugs.' });
    const promptResult = vi.fn<PromptResult>(async () => answered(''));
    const managers = makeManagers(promptResult, () => false);
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);
    await settle();

    expect(mocks.notify).toHaveBeenCalledWith(
      managers, 'editor-suggest', 'notes', 'reviewer: ACP: the ask role lists no models.',
    );
    expect(callback).toHaveBeenCalledWith({ hunks: [] });
    expect(promptResult).not.toHaveBeenCalled();
  });

  it('surfaces a core "prompt already running" refusal without starting a second prompt', async () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', role: 'ask', body: 'Watch for bugs.' });
    const promptResult = vi.fn<PromptResult>(async () => refused('ACP: a prompt is already running.'));
    const managers = makeManagers(promptResult);
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);
    await settle();

    expect(promptResult).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(
      managers, 'editor-suggest', 'notes', 'reviewer: ACP: a prompt is already running.',
    );
    expect(callback).toHaveBeenCalledWith({ hunks: [] });
  });

  it('notifies a core error result and returns no hunks', async () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', role: 'ask', body: 'Watch for bugs.' });
    const promptResult = vi.fn<PromptResult>(async () => refused('boom'));
    const managers = makeManagers(promptResult);
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);
    await settle();

    expect(mocks.notify).toHaveBeenCalledWith(managers, 'editor-suggest', 'notes', 'reviewer: boom');
    expect(callback).toHaveBeenCalledWith({ hunks: [] });
  });

  it('notifies "no suggestion" when the answer proposes no hunks', async () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', role: 'ask', body: 'Watch for bugs.' });
    const promptResult = vi.fn<PromptResult>(async () => answered('OK, nothing to change.'));
    const managers = makeManagers(promptResult);
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);
    await settle();

    expect(mocks.notify).toHaveBeenCalledWith(managers, 'editor-suggest', 'notes', 'reviewer: no suggestion');
    expect(callback).toHaveBeenCalledWith({ hunks: [] });
  });

  it('carries the persona body and hunk format on every query, with no first-turn branch', async () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', role: 'ask', body: 'Watch for bugs.' });
    const promptResult = vi.fn<PromptResult>(async () => answered('OK'));
    const managers = makeManagers(promptResult);

    editorSuggest(managers, baseParams, vi.fn());
    await settle();
    editorSuggest(managers, baseParams, vi.fn());
    await settle();

    expect(promptResult).toHaveBeenCalledTimes(2);
    for (const call of promptResult.mock.calls) {
      expect(call[1]).toContain('Watch for bugs.');
      expect(call[1]).toContain('Reply with zero or more proposed edits');
      expect(call[1]).toContain('hello world');
      expect(call[1]).toContain('Request: rewrite this');
    }
  });

  it('notifies a rejected prompt as an ACP error', async () => {
    mocks.listPersonas.mockReturnValue(['reviewer']);
    mocks.loadPersona.mockReturnValue({ name: 'reviewer', role: 'ask', body: 'Watch for bugs.' });
    const promptResult = vi.fn<PromptResult>(() => Promise.reject(new Error('spawn failed')));
    const managers = makeManagers(promptResult);
    const callback = vi.fn();

    editorSuggest(managers, baseParams, callback);
    await settle();

    expect(mocks.notify).toHaveBeenCalledWith(managers, 'editor-suggest', 'notes', 'reviewer: ACP error: spawn failed');
    expect(callback).toHaveBeenCalledWith({ hunks: [] });
  });
});
