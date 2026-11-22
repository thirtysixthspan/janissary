import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as AcpIndex from '../acp/index.js';
import type * as PersonaRole from '../acp/persona-role.js';
import type * as AskRole from '../acp/ask-role.js';
import type { AcpSession } from '../acp/types.js';
import type { Managers } from '../managers.js';
import type { MonitorSub } from './live-monitors.js';
import type { Persona } from '../personas.js';
import type { Tab } from '../tab/types.js';

const ENTRY = { harness: 'opencode', model: 'model-x' };
const mocks = vi.hoisted(() => ({
  promptPersonaRole: vi.fn(),
  connectAcp: vi.fn(),
  knownRoleSettings: vi.fn(),
}));

vi.mock('../acp/persona-role.js', async (importOriginal) => ({
  ...await importOriginal<typeof PersonaRole>(), promptPersonaRole: mocks.promptPersonaRole,
}));
vi.mock('../acp/index.js', async (importOriginal) => ({
  ...await importOriginal<typeof AcpIndex>(), connectAcp: mocks.connectAcp,
}));
vi.mock('../acp/ask-role.js', async (importOriginal) => ({
  ...await importOriginal<typeof AskRole>(), knownRoleSettings: mocks.knownRoleSettings,
}));

import { primeMonitorSession, respawnMonitorSession, idleSession } from './session.js';
import { PersonaRoleSessionManager } from '../acp/persona-role-session.js';
import { tabRuntime } from '../tab/runtime.js';
import { personaRoleRuntime } from '../acp/persona-role-state.js';
import { messageBus } from '../bus.js';

function makePersona(): Persona {
  return { name: 'reviewer', role: 'research', body: 'Watch for bugs.', tools: [] };
}

function makeSession(): { session: AcpSession; kill: ReturnType<typeof vi.fn> } {
  const kill = vi.fn();
  return {
    session: { prompt: vi.fn(), kill, cancel: async () => {}, shutdown: async () => {} },
    kill,
  };
}

function setup(): {
  managers: Managers;
  reg: MonitorSub;
  append: ReturnType<typeof vi.fn>;
  tab: Tab;
} {
  const tab = {
    label: 'main', title: 'main', runtime: { busy: false, context: [], queue: [] },
  } as unknown as Tab;
  const tabs = [tab];
  const append = vi.fn();
  const managers = {
    tab: {
      tabs,
      byLabel: (label: string) => tabs.find((t) => t.label === label),
      cwdOf: () => '/repo',
      launchDir: '/launch',
      append,
    },
    acp: { launchableEntries: () => [ENTRY] },
  } as unknown as Managers;
  managers.personaRoleSessions = new PersonaRoleSessionManager(managers);
  const reg = {
    owner: 'main', inline: true, persona: makePersona(), targets: [], buffer: [],
    harnessTranscriptSeen: new Map(), harnessSeen: new Map(), editorSeen: new Map(), pageSeen: new Map(),
    delimiter: 'JANUS-MONITOR-TEST', session: idleSession(), info: undefined,
    inFlight: false, delivered: 0, contextBytes: 0, contextText: [],
    timer: setInterval(() => {}, 1_000_000), subs: [],
  } as unknown as MonitorSub;
  return { managers, reg, append, tab };
}

function coreSession(): AcpSession {
  return makeSession().session;
}

function settled(result: { answered: boolean; reply?: string; error?: string; session?: string }): unknown {
  return new Proxy({}, {
    get: (_target, key) => key === 'then'
      ? (callback: (value: typeof result) => void) => { callback(result); }
      : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  messageBus.clear();
  mocks.knownRoleSettings.mockReturnValue({ name: 'research', entries: [ENTRY], commands: [] });
  mocks.connectAcp.mockImplementation(() => coreSession());
  mocks.promptPersonaRole.mockImplementation((
    managers: Managers, label: string, prompt: string, role: string, _persona: string,
  ) => {
    const tab = managers.tab.byLabel(label)!;
    const state = personaRoleRuntime(tabRuntime(tab), role);
    if (!state.session) {
      managers.personaRoleSessions.session(label, role, ENTRY, '/repo', { onError: () => {} });
    }
    return settled({ answered: true, reply: 'recorded reply', session: 'persona-acp-1' });
  });
});

describe('primeMonitorSession', () => {
  it('enters the core role entry with the persona body, format, and trust framing', () => {
    const { managers, reg } = setup();

    primeMonitorSession(reg, managers);

    expect(mocks.promptPersonaRole).toHaveBeenCalledWith(
      managers, 'main', expect.stringContaining('Watch for bugs.'), 'research', 'reviewer',
    );
    const prompt = mocks.promptPersonaRole.mock.calls[0][2] as string;
    expect(prompt).toContain('[SUGGESTION]');
    expect(prompt).toContain('JANUS-MONITOR-TEST');
  });

  it('uses the session the core entry opened and reports the role-configured model', () => {
    const { managers, reg, append } = setup();

    primeMonitorSession(reg, managers);

    expect(reg.session).toBe(personaRoleRuntime(tabRuntime(managers.tab.byLabel('main')!), 'research').session);
    expect(reg.info).toEqual({ provider: 'opencode', model: 'model-x' });
    expect(append).toHaveBeenCalledWith('main', {
      input: '',
      output: 'monitor reviewer: connected (opencode/model-x) — Watch for bugs.',
    });
  });

  it('clears the in-flight flag and records the reply when the core prompt settles', () => {
    const { managers, reg } = setup();
    primeMonitorSession(reg, managers);

    expect(reg.inFlight).toBe(false);
    expect(reg.contextText.map((entry) => entry.text)).toContain('recorded reply');
  });

  it('clears in-flight with no owner-tab line on a notification-only role failure', () => {
    mocks.promptPersonaRole.mockImplementation(() => settled({
      answered: false, error: 'Persona "reviewer" requests unknown role "research".',
    }));
    const { managers, reg, append } = setup();
    const idle = reg.session;

    primeMonitorSession(reg, managers);

    expect(reg.inFlight).toBe(false);
    expect(reg.session).toBe(idle);
    expect(append).not.toHaveBeenCalledWith('main', expect.objectContaining({
      output: expect.stringContaining('monitor reviewer:'),
    }));
    expect(append).not.toHaveBeenCalledWith('main', expect.objectContaining({ output: expect.stringContaining('connected') }));
  });
});

describe('respawnMonitorSession', () => {
  it('closes the role slot, resets context, and primes a fresh session', () => {
    const { managers, reg } = setup();
    primeMonitorSession(reg, managers);
    const oldSession = reg.session;
    const kill = vi.spyOn(oldSession, 'kill');
    reg.contextBytes = 5000;
    reg.contextText = [{ role: 'input', text: 'old' }];

    respawnMonitorSession(reg, managers, new Map([[`${reg.owner}:${reg.persona.name}`, reg]]));

    expect(kill).toHaveBeenCalledTimes(1);
    expect(reg.contextBytes).toBeLessThan(5000);
    expect(mocks.promptPersonaRole).toHaveBeenCalledTimes(2);
    expect(reg.session).not.toBe(oldSession);
    expect(reg.inFlight).toBe(false);
  });
});
