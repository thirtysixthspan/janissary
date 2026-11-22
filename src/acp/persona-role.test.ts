import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AskRole from './ask-role.js';
import type * as RunPrompt from './run-prompt.js';
import type * as AcpIndex from './index.js';
import type { AcpSession } from './types.js';
import type { Managers } from '../managers.js';
import type { Tab, TabRuntime } from '../tab/types.js';
import { messageBus } from '../bus.js';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  knownRoleSettings: vi.fn(),
  launchableEntries: vi.fn(),
  prepareCorePromptRecord: vi.fn(),
  runCorePrompt: vi.fn(),
  connectAcp: vi.fn(),
}));

vi.mock('../notifications/index.js', () => ({ notify: mocks.notify }));
vi.mock('./ask-role.js', async (importOriginal) => ({
  ...await importOriginal<typeof AskRole>(), knownRoleSettings: mocks.knownRoleSettings,
}));
vi.mock('./run-prompt.js', async (importOriginal) => ({
  ...await importOriginal<typeof RunPrompt>(),
  prepareCorePromptRecord: mocks.prepareCorePromptRecord,
  runCorePrompt: mocks.runCorePrompt,
}));
vi.mock('./index.js', async (importOriginal) => ({
  ...await importOriginal<typeof AcpIndex>(), connectAcp: mocks.connectAcp,
}));

import { promptPersonaRole } from './persona-role.js';
import { PersonaRoleSessionManager } from './persona-role-session.js';
import { runAcpCommand } from './response.js';

const ENTRY = { harness: 'opencode', model: 'model-x' };

function makeSession(): { session: AcpSession; kill: ReturnType<typeof vi.fn> } {
  const kill = vi.fn();
  return {
    session: { prompt: vi.fn(), kill, cancel: vi.fn(async () => {}), shutdown: vi.fn(async () => {}) }, kill,
  };
}

function harness(labels: string[] = ['tab']) {
  const tabs = labels.map((label) => ({
    label, title: label, runtime: { busy: false, context: [], queue: [] } as unknown as TabRuntime,
  })) as unknown as Tab[];
  const append = vi.fn();
  const managers = {
    tab: {
      tabs,
      byLabel: (label: string) => tabs.find((tab) => tab.label === label),
      cwdOf: () => '/repo',
      launchDir: '/launch',
      append,
      updateRunning: vi.fn(),
      deleteBusy: vi.fn(),
    },
    acp: { launchableEntries: mocks.launchableEntries },
    acpRecords: {
      begin: vi.fn(() => 'record-1'), prompt: vi.fn(() => true), activity: vi.fn(),
      reply: vi.fn(), answer: vi.fn(), close: vi.fn(), rows: vi.fn(() => []),
    },
  } as unknown as Managers;
  managers.personaRoleSessions = new PersonaRoleSessionManager(managers);
  return { managers, tabs, append };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.launchableEntries.mockReturnValue([ENTRY]);
  mocks.connectAcp.mockImplementation(() => makeSession().session);
  mocks.runCorePrompt.mockImplementation((_managers, _label, _runtime, request, _settings, _session, identity) => {
    request.finish({ answered: true, reply: 'done', session: identity });
  });
  messageBus.clear();
});

afterEach(() => { vi.clearAllMocks(); });

describe('promptPersonaRole configuration failures', () => {
  it('reports an unknown role with the exact notification and starts nothing', async () => {
    mocks.knownRoleSettings.mockReturnValue(undefined);
    const { managers, tabs, append } = harness();

    const result = await promptPersonaRole(managers, 'tab', 'hello', 'missing', 'reviewer');

    const message = 'Persona "reviewer" requests unknown role "missing".';
    expect(result).toEqual({ answered: false, error: message });
    expect(mocks.knownRoleSettings).toHaveBeenCalledWith('/launch', 'missing');
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(managers, 'manual', 'tab', message);
    expect(mocks.connectAcp).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(tabs[0].runtime?.personaRoles).toBeUndefined();
  });

  it('reports a role with no enabled models with the exact notification and starts nothing', async () => {
    mocks.knownRoleSettings.mockReturnValue({ name: 'Custom', entries: [ENTRY], commands: [] });
    mocks.launchableEntries.mockReturnValue([]);
    const { managers, tabs, append } = harness();

    const result = await promptPersonaRole(managers, 'tab', 'hello', 'custom', 'reviewer');

    const message = 'Persona "reviewer" finds no enabled models in role "custom".';
    expect(result).toEqual({ answered: false, error: message });
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(managers, 'manual', 'tab', message);
    expect(mocks.connectAcp).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(tabs[0].runtime?.personaRoles).toBeUndefined();
  });
});

describe('promptPersonaRole core pipeline', () => {
  beforeEach(() => {
    mocks.knownRoleSettings.mockImplementation((_root: string, role: string) => ({
      name: role === 'custom' ? 'Custom Role' : role, entries: [ENTRY], commands: ['file read'],
    }));
  });

  it('launches the resolved role model and reports it as the session identity', async () => {
    const { managers } = harness();

    const result = await promptPersonaRole(managers, 'tab', 'hello', 'custom', 'reviewer');

    expect(mocks.connectAcp).toHaveBeenCalledWith(expect.objectContaining({ command: 'opencode', cwd: '/repo' }));
    expect(managers.acpRecords.begin).toHaveBeenCalledWith({
      kind: 'acp', role: 'custom', model: 'model-x', ownerLabel: 'tab', ownerName: 'tab',
    });
    expect(result).toEqual({ answered: true, reply: 'done', session: 'persona-acp-1' });
  });

  it('passes the role grants into the core prompt request', async () => {
    const { managers } = harness();

    await promptPersonaRole(managers, 'tab', 'hello', 'custom', 'reviewer');

    const request = mocks.runCorePrompt.mock.calls[0][3];
    expect(request).toMatchObject({
      prompt: 'hello', role: 'custom', roleName: 'Custom Role', commands: ['file read'],
    });
    expect(request.state).toBe(managers.tab.byLabel('tab')?.runtime?.personaRoles?.custom);
  });

  it('keeps two role names on one tab in separate slots with their own sessions', async () => {
    const { managers, tabs } = harness();
    const sessions = [makeSession().session, makeSession().session];
    mocks.connectAcp.mockReturnValueOnce(sessions[0]).mockReturnValueOnce(sessions[1]);

    await promptPersonaRole(managers, 'tab', 'first', 'custom', 'reviewer');
    await promptPersonaRole(managers, 'tab', 'second', 'planning', 'reviewer');

    const slots = tabs[0].runtime?.personaRoles;
    expect(Object.keys(slots ?? {})).toEqual(['custom', 'planning']);
    expect(slots?.custom.session).toBe(sessions[0]);
    expect(slots?.planning.session).toBe(sessions[1]);
    expect(slots?.custom.recordId).toBe('record-1');
    expect(mocks.knownRoleSettings).toHaveBeenCalledWith('/launch', 'planning');
  });

  it('reuses the session for a later prompt under the same role', async () => {
    const { managers } = harness();

    await promptPersonaRole(managers, 'tab', 'first', 'custom', 'reviewer');
    await promptPersonaRole(managers, 'tab', 'second', 'custom', 'reviewer');

    expect(mocks.connectAcp).toHaveBeenCalledTimes(1);
  });
});

describe('PersonaRoleSessionManager', () => {
  it('forgets a dead session, reports to the latest hook, and spawns afresh', () => {
    const { managers, tabs } = harness();
    const first = makeSession().session;
    const next = makeSession().session;
    mocks.connectAcp.mockReturnValueOnce(first).mockReturnValueOnce(next);
    const earlier = vi.fn();
    const latest = vi.fn();
    const service = managers.personaRoleSessions;

    service.session('tab', 'custom', ENTRY, '/repo', { onError: earlier });
    service.session('tab', 'custom', ENTRY, '/repo', { onError: latest });
    const onError = mocks.connectAcp.mock.calls[0][0].onError as (message: string) => void;
    onError('ACP agent exited.');

    expect(service.hasSession('tab', 'custom')).toBe(false);
    expect(tabs[0].runtime?.personaRoles?.custom).toBeUndefined();
    expect(earlier).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledExactlyOnceWith('ACP agent exited.');
    expect(service.session('tab', 'custom', ENTRY, '/repo', { onError: vi.fn() })).toBe(next);
  });

  it('records a transcript and drops it on close', () => {
    const { managers } = harness();
    const service = managers.personaRoleSessions;
    service.session('tab', 'custom', ENTRY, '/repo', { onError: vi.fn() });
    service.record('tab', 'custom', 'Review this', 'input');

    expect(service.transcript('tab', 'custom')).toContain('SENT TO MODEL');
    expect(service.transcript('tab', 'custom')).toContain('Review this');
    expect(service.close('tab', 'custom')).toBe(true);
    expect(service.transcript('tab', 'custom')).toBe('');
  });

  it('releaseTab and dispose release only the sessions they own', () => {
    const { managers } = harness(['tab', 'other']);
    const first = makeSession();
    const second = makeSession();
    mocks.connectAcp.mockReturnValueOnce(first.session).mockReturnValueOnce(second.session);
    const service = managers.personaRoleSessions;
    service.session('tab', 'custom', ENTRY, '/repo', { onError: vi.fn() });
    service.session('other', 'custom', ENTRY, '/repo', { onError: vi.fn() });

    service.releaseTab('tab');
    expect(first.kill).toHaveBeenCalledTimes(1);
    expect(service.hasSession('other', 'custom')).toBe(true);
    service.dispose();
    expect(second.kill).toHaveBeenCalledTimes(1);
  });
});

describe('ask and tell adapter', () => {
  it.each(['ask', 'tell'] as const)('keeps %s entering through promptResult with its receipt', async (role) => {
    const { managers, tabs } = harness();
    const promptResult = vi.fn(async () => ({ answered: true as const, reply: 'ok', session: 's' }));
    managers.acp.promptResult = promptResult;

    const receipt = runAcpCommand(`${role} hello`, { label: 'tab', index: 0 }, managers, undefined, role);
    await Promise.resolve();
    await Promise.resolve();

    expect(managers.acp.promptResult).toHaveBeenCalledWith(
      'tab', `${role} hello`, role,
      expect.objectContaining({ appendRefusalToTranscript: false, replyId: receipt.replyId }),
    );
    expect(tabs[0].runtime).toBeDefined();
  });
});
