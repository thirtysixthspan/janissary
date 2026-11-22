import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AskRole from '../acp/ask-role.js';
import type * as RunPrompt from '../acp/run-prompt.js';
import type * as AcpIndex from '../acp/index.js';
import type * as Personas from '../personas.js';
import type { AcpPendingPrompt } from '../acp/prompt-state.js';
import type { Managers } from '../managers.js';
import type { Tab, TabRuntime } from '../tab/types.js';
import { messageBus } from '../bus.js';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  knownRoleSettings: vi.fn(),
  runCorePrompt: vi.fn(),
  prepareCorePromptRecord: vi.fn(),
  connectAcp: vi.fn(),
  listPersonas: vi.fn(),
  loadPersona: vi.fn(),
}));

vi.mock('../notifications/index.js', () => ({ notify: mocks.notify }));
vi.mock('../acp/ask-role.js', async (importOriginal) => ({
  ...await importOriginal<typeof AskRole>(), knownRoleSettings: mocks.knownRoleSettings,
}));
vi.mock('../acp/run-prompt.js', async (importOriginal) => ({
  ...await importOriginal<typeof RunPrompt>(),
  runCorePrompt: mocks.runCorePrompt,
  prepareCorePromptRecord: mocks.prepareCorePromptRecord,
}));
vi.mock('../acp/index.js', async (importOriginal) => ({
  ...await importOriginal<typeof AcpIndex>(), connectAcp: mocks.connectAcp,
}));
vi.mock('../personas.js', async (importOriginal) => ({
  ...await importOriginal<typeof Personas>(),
  listPersonas: mocks.listPersonas,
  loadPersona: mocks.loadPersona,
}));

import { editorSuggest } from './handler.js';
import { PersonaRoleSessionManager } from '../acp/persona-role-session.js';
import { EditorAcpManager } from '../editor/acp-manager.js';

const ENTRY = { harness: 'opencode', model: 'model-x' };
const HUNK = '[HUNK]\n[ANCHOR]: hello\n[REPLACEMENT]: goodbye\n[/HUNK]';
const PARAMS = { url: '/open/1', persona: 'reviewer', content: 'hello world', prompt: 'rewrite this' };

function harness(): Managers {
  const tabs = [{
    label: 'notes', title: 'notes', editor: { url: '/open/1' },
    runtime: { busy: false, context: [], queue: [] } as unknown as TabRuntime,
  }] as unknown as Tab[];
  const managers = {
    tab: {
      tabs,
      byLabel: (label: string) => tabs.find((tab) => tab.label === label),
      editorTabByUrl: (url: string) => tabs.find((tab) => tab.editor?.url === url),
      cur: () => ({ label: 'notes' }),
      cwdOf: () => '/repo',
      workingDirOf: () => '/repo',
      launchDir: '/launch',
      append: vi.fn(),
      updateRunning: vi.fn(),
      deleteBusy: vi.fn(),
    },
    acp: { launchableEntries: vi.fn(() => [ENTRY]) },
    acpRecords: {
      begin: vi.fn(() => 'record-1'), prompt: vi.fn(() => true), activity: vi.fn(),
      reply: vi.fn(), answer: vi.fn(), close: vi.fn(), rows: vi.fn(() => []),
    },
  } as unknown as Managers;
  managers.personaRoleSessions = new PersonaRoleSessionManager(managers);
  managers.editorAcp = new EditorAcpManager(managers);
  return managers;
}

function deathHook(): (message: string) => void {
  const options = mocks.connectAcp.mock.calls[0][0] as { onError: (message: string) => void };
  return options.onError;
}

async function settleReply(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  messageBus.clear();
  mocks.listPersonas.mockReturnValue(['reviewer']);
  mocks.loadPersona.mockReturnValue({ name: 'reviewer', role: 'research', body: 'Watch for bugs.' });
  mocks.knownRoleSettings.mockReturnValue({ name: 'research', entries: [ENTRY], commands: [] });
  mocks.connectAcp.mockImplementation(() => ({
    prompt: vi.fn(), kill: vi.fn(), cancel: async () => {}, shutdown: async () => {},
  }));
  mocks.runCorePrompt.mockImplementation((_managers, _label, _runtime, request: AcpPendingPrompt) => {
    if (request.state) delete request.state.prompt;
    request.finish({ answered: true, reply: HUNK, session: 'persona-acp-1' });
  });
});

describe('editor persona death after a settled reply', () => {
  it('launches one role-based session and lists one connection with no durable record', async () => {
    const managers = harness();

    editorSuggest(managers, PARAMS, vi.fn());
    await settleReply();

    expect(mocks.connectAcp).toHaveBeenCalledTimes(1);
    expect(managers.acpRecords.begin).not.toHaveBeenCalled();
    expect(managers.editorAcp.connectionsFor('notes')).toEqual([
      { text: 'reviewer (acp)', kind: 'acp', acpRef: { scope: 'editor', label: 'notes', persona: 'reviewer' } },
    ]);
  });

  it('reports the real role-session death once and never calls back again', async () => {
    const managers = harness();
    const callback = vi.fn();

    editorSuggest(managers, PARAMS, callback);
    await settleReply();

    expect(callback).toHaveBeenCalledExactlyOnceWith({ hunks: [{ anchor: 'hello', replacement: 'goodbye' }] });

    deathHook()('ACP agent exited.');

    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(
      managers, 'editor-suggest', 'notes', 'reviewer: ACP agent exited.',
    );
    expect(callback).toHaveBeenCalledTimes(1);
    expect(managers.editorAcp.hasSession('notes', 'research')).toBe(false);
  });

  it('ignores a repeated late error from the already forgotten session', async () => {
    const managers = harness();
    const callback = vi.fn();

    editorSuggest(managers, PARAMS, callback);
    await settleReply();

    deathHook()('ACP agent exited.');
    deathHook()('ACP agent exited again.');

    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(
      managers, 'editor-suggest', 'notes', 'reviewer: ACP agent exited.',
    );
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
