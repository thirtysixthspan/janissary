import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LogEntry, Tab } from '../tab/types.js';
import { monitorTab } from '../tab/lookup.js';
import type { Managers } from '../managers.js';
import { makeTab } from '../tab/index.js';
import { messageBus } from '../bus.js';
import { MonitorManager } from './manager.js';
import { writeCaptureFile } from '../harness/capture/file.js';
import type * as Personas from '../personas.js';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  loadPersona: vi.fn(),
  realLoadPersona: undefined as unknown as typeof Personas.loadPersona,
}));

vi.mock('../notifications/index.js', () => ({
  notify: mocks.notify,
}));

vi.mock('../personas.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Personas>();
  mocks.realLoadPersona = actual.loadPersona;
  return {
    ...actual,
    loadPersona: (name: string, kind: Personas.PersonaKind, root?: string) =>
      mocks.loadPersona(name, kind, root),
  };
});

vi.mock('../harness/capture/file.js', () => ({
  writeCaptureFile: vi.fn(() => '/project/.janissary/captures/assistant-now.txt'),
  initHarnessCaptureDirectory: vi.fn(),
  ensureCaptureDirectory: vi.fn(),
  clearCaptureDirectory: vi.fn(),
}));

// Fake core ACP: captures every prompt the monitors send and lets each test settle it with a
// final result, the way AcpManager.promptResult resolves. A second prompt for a busy label/role
// settles immediately with core's refusal, modelling the shared role session.
type PromptCall = {
  label: string;
  prompt: string;
  role: string;
  pending: boolean;
  settle: (result: unknown) => void;
  reject: (error: unknown) => void;
};

function makeFakeAcp() {
  const calls: PromptCall[] = [];
  const closed: { label: string; role: string }[] = [];
  const promptResult = vi.fn((label: string, prompt: string, role: string) => new Promise<unknown>((resolve, reject) => {
    if (calls.some((call) => call.pending && call.label === label && call.role === role)) {
      calls.push({ label, prompt, role, pending: false, settle: () => {}, reject: () => {} });
      resolve({ answered: false, error: 'ACP: a prompt is already running.' });
      return;
    }
    const call: PromptCall = { label, prompt, role, pending: true, settle: () => {}, reject: () => {} };
    call.settle = (result) => { call.pending = false; resolve(result); };
    call.reject = (error) => { call.pending = false; reject(error); };
    calls.push(call);
  }));
  const close = vi.fn((label: string, _output: unknown, role: string) => {
    closed.push({ label, role });
    return true;
  });
  const settleWith = async (call: PromptCall, result: unknown) => {
    call.settle(result);
    await Promise.resolve();
    await Promise.resolve();
  };
  return {
    promptResult,
    close,
    calls,
    closed,
    get prompts() { return calls.map((call) => call.prompt); },
    reply: (index: number, reply: string) => settleWith(calls[index], { answered: true, reply, session: 'session' }),
    fail: (index: number, error: string) => settleWith(calls[index], { answered: false, error }),
    reject: (index: number, error: unknown) => settleWith(calls[index], error),
  };
}

type FakeAcp = ReturnType<typeof makeFakeAcp>;

function makeFakeManagers(
  tabs: Tab[], isKnownModel: (harness: string, model: string) => boolean = () => true,
) {
  const appended: { label: string; entry: LogEntry }[] = [];
  const finished: { label: string; output: string }[] = [];
  const screens: Record<string, { text: string; capturedAt: number } | undefined> = {};
  const transcripts: Record<string, string[] | undefined> = {};
  const openFiles = new Map<string, string>();
  const fakeTab = {
    tabs,
    launchDir: '/project',
    cwdOf: () => '/tmp',
    cur: () => tabs[0],
    append: (label: string, entry: LogEntry) => { appended.push({ label, entry }); },
    startRunning: () => {},
    finishRunning: (label: string, output: string) => { finished.push({ label, output }); },
    openFilePath: (id: string) => openFiles.get(id),
    monitorTab: (label: string) => monitorTab(fakeTab.tabs, label),
    findIndex: (label: string) => fakeTab.tabs.findIndex((t) => t.label === label),
    closeTab: (index: number) => { fakeTab.tabs.splice(index, 1); },
  };
  const edit = vi.fn();
  const managers = {
    tab: fakeTab,
    harness: {
      latestScreenText: (label: string) => screens[label],
      transcriptTailer: (label: string) => {
        const entries = transcripts[label];
        return entries && { entriesAfter: (index: number) => entries.slice(index) };
      },
    },
    openFile: { edit },
    models: { isKnownModel },
  } as unknown as Managers;
  return { managers, appended, finished, screens, transcripts, edit, openFiles };
}

function harness(tabs: Tab[], isKnownModel?: (harness: string, model: string) => boolean) {
  const fake = makeFakeManagers(tabs, isKnownModel);
  const acpFake = makeFakeAcp();
  Object.assign(fake.managers, { acp: acpFake });
  const monitor = new MonitorManager(fake.managers, FLUSH_MS);
  acp = acpFake;
  return { ...fake, acp: acpFake, monitor };
}

function harnessTab(label: string): Tab {
  return { ...makeTab(label, '#aaa'), view: 'harness' } as Tab;
}

function editorTab(label: string, id: string, name = 'notes.txt'): Tab {
  return { ...makeTab(label, '#ddd'), view: 'editor', editor: { name, url: `/open/${id}`, path: '', size: '' } } as unknown as Tab;
}

function pageTab(label: string, domain = 'example.org'): Tab {
  return { ...makeTab(label, '#eee'), view: 'page', page: { url: `https://${domain}`, domain, number: 1 } } as unknown as Tab;
}

function emitEntry(tab: Tab, input: string, output: string): void {
  messageBus.emit('transcript', { type: 'entry:appended', tabLabel: tab.label, entry: { input, output }, tab });
}

const FLUSH_MS = 1000;

class ReceiverAwareModels {
  known = true;
  isKnownModel(_harness: string, _model: string): boolean { return this.known; }
}

let janus: Tab;
let agent2: Tab;
let acp: FakeAcp;

beforeEach(() => {
  vi.useFakeTimers();
  mocks.loadPersona.mockReset();
  mocks.loadPersona.mockImplementation((name: string, kind: Personas.PersonaKind, root?: string) =>
    mocks.realLoadPersona(name, kind, root));
  janus = makeTab('janus', '#aaa');
  agent2 = { ...makeTab('agent2', '#bbb'), group: 2, groupColor: '#bbb' };
});

afterEach(() => {
  vi.useRealTimers();
  messageBus.clear();
});

describe('MonitorManager', () => {
  it('inline mode: watches the owner tab and appends suggestions to its transcript', async () => {
    const { managers, appended, monitor } = harness([janus]);

    expect(monitor.start('janus', 'security', [])).toBeNull();
    expect(acp.calls).toHaveLength(0); // no dedicated priming prompt on start

    emitEntry(janus, 'cat .env', 'SECRET=hunter2');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts[0]).toContain('[SUGGESTION]'); // persona framing rides with the first batch
    expect(acp.prompts[0]).toContain('cat .env');
    await acp.reply(0, '[SUGGESTION]: Rotate that secret\n[COMMAND]: shell git status');
    expect(appended).toHaveLength(1);
    expect(appended[0].label).toBe('janus');
    expect(appended[0].entry.background).toEqual(expect.any(String));
    expect(appended[0].entry.output).toBe('💡 security: Rotate that secret\nshell git status');
    expect(managers.tab.tabs).toHaveLength(1);
  });

  it('skips the flush entirely when no new transcripts arrived', () => {
    const { monitor } = harness([janus]);
    monitor.start('janus', 'security', []);
    vi.advanceTimersByTime(FLUSH_MS * 3);
    expect(acp.calls).toHaveLength(0);
  });

  it('batches multiple entries into one prompt per tick', () => {
    const { monitor } = harness([janus]);
    monitor.start('janus', 'security', []);
    emitEntry(janus, 'ls', 'a b c');
    emitEntry(janus, 'pwd', '/tmp');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts).toHaveLength(1);
    expect(acp.prompts[0]).toContain('ls');
    expect(acp.prompts[0]).toContain('pwd');
  });

  it('never feeds a monitor its own inline suggestions', () => {
    const { monitor } = harness([janus]);
    monitor.start('janus', 'security', []);
    emitEntry(janus, '', '💡 security: previous suggestion');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.calls).toHaveLength(0);
  });

  it('external mode: delivers into the persona reporting tab colored after the target', async () => {
    const { managers, monitor } = harness([janus, agent2]);
    expect(monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }])).toBeNull();
    expect(managers.tab.tabs.find((t) => t.view === 'monitor')?.monitor?.suggestions).toEqual([]);

    emitEntry(agent2, 'npm test', '1 failing');
    vi.advanceTimersByTime(FLUSH_MS);
    await acp.reply(0, '[SUGGESTION]: Fix the failing test');

    const feed = managers.tab.tabs.find((t) => t.view === 'monitor');
    expect(feed?.label).toBe('assistant');
    expect(feed?.dotColor).toBe('#bbb');
    expect(feed?.monitor?.suggestions).toHaveLength(1);
    expect(feed?.monitor?.suggestions[0]).toMatchObject({ text: 'Fix the failing test', about: 'agent2' });
  });

  it('sets the reporting tab persona, targets, and an initial contextBytes from the first prompt', () => {
    const { managers, monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    const feed = managers.tab.tabs.find((t) => t.view === 'monitor');
    expect(feed?.monitor?.persona).toBe('assistant');
    expect(feed?.monitor?.targets).toBe('agent2');
    expect(feed?.monitor?.contextBytes).toBeGreaterThan(0);
  });

  it('increases contextBytes further after a flush', async () => {
    const { managers, monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    const before = managers.tab.tabs.find((t) => t.view === 'monitor')!.monitor!.contextBytes;
    emitEntry(agent2, 'npm test', '1 failing');
    vi.advanceTimersByTime(FLUSH_MS);
    await acp.reply(0, '[SUGGESTION]: Fix the failing test');
    expect(managers.tab.tabs.find((t) => t.view === 'monitor')!.monitor!.contextBytes).toBeGreaterThan(before);
  });

  it('snapshotContext writes the accumulated context to a file and opens it in an editor tab', async () => {
    const { edit, monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    emitEntry(agent2, 'npm test', '1 failing');
    vi.advanceTimersByTime(FLUSH_MS);
    await acp.reply(0, '[SUGGESTION]: Fix the failing test');
    vi.mocked(writeCaptureFile).mockClear();

    monitor.snapshotContext('assistant');

    expect(writeCaptureFile).toHaveBeenCalledTimes(1);
    const [label, , text] = vi.mocked(writeCaptureFile).mock.calls[0];
    expect(label).toBe('assistant');
    expect(text).toContain('[SUGGESTION]'); // persona framing
    expect(text).toContain('npm test'); // flushed update prompt
    expect(text).toContain('Fix the failing test'); // reply
    expect(edit).toHaveBeenCalledWith('monitor context assistant', '/project/.janissary/captures/assistant-now.txt', 'janus');
    expect(text).toContain('SENT TO MODEL');
    expect(text).toContain('MODEL RESPONSE');
    expect(text).toMatch(/SENT TO MODEL[\s\S]*\[SUGGESTION]/);
    expect(text).toMatch(/SENT TO MODEL[\s\S]*npm test/);
    expect(text).toMatch(/MODEL RESPONSE[^\n]*\n\[SUGGESTION]: Fix the failing test/);
    expect(text).toContain('SENT TO MODEL END');
    expect(text).toContain('MODEL RESPONSE END');
    expect(text).toMatch(/Fix the failing test\n━━━━━━━━━━ MODEL RESPONSE END ━━━━━━━━━━/);
  });

  it('snapshotContext is a no-op for an unknown reporting tab', () => {
    const { edit, monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    vi.mocked(writeCaptureFile).mockClear();
    monitor.snapshotContext('nonexistent');
    expect(writeCaptureFile).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });

  it('transcript returns the formatted context for a running monitor', async () => {
    const { monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    emitEntry(agent2, 'npm test', '1 failing');
    vi.advanceTimersByTime(FLUSH_MS);
    await acp.reply(0, '[SUGGESTION]: Fix the failing test');
    const text = monitor.transcript('assistant');
    expect(text).toContain('SENT TO MODEL');
    expect(text).toContain('npm test');
    expect(text).toContain('MODEL RESPONSE');
    expect(text).toContain('Fix the failing test');
  });

  it('transcript returns an empty string for an unknown monitor name', () => {
    const { monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    expect(monitor.transcript('nonexistent')).toBe('');
  });

  it('dropping one of two tab targets updates targets to the remaining one without closing the tab', () => {
    const agent3 = makeTab('agent3', '#ccc');
    const { managers, monitor } = harness([janus, agent2, agent3]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }, { kind: 'tab', label: 'agent3' }]);
    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'agent2' });
    expect(managers.tab.tabs.find((t) => t.view === 'monitor')?.monitor?.targets).toBe('agent3');
  });

  it('starting with a target given as a renamed tab alias resolves and monitors it', () => {
    const renamed = { ...agent2, title: 'reviewer' };
    const { managers, monitor } = harness([janus, renamed]);
    expect(monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'reviewer' }])).toBeNull();
    expect(managers.tab.tabs.find((t) => t.view === 'monitor')?.monitor?.targets).toBe('agent2');
  });

  it('stopping a target given as a renamed tab alias drops the matching tab target', () => {
    const agent3 = makeTab('agent3', '#ccc');
    const renamed = { ...agent2, title: 'reviewer' };
    const { managers, monitor } = harness([janus, renamed, agent3]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }, { kind: 'tab', label: 'agent3' }]);
    expect(monitor.stop('janus', 'assistant', { kind: 'tab', label: 'reviewer' })).toBe(true);
    expect(managers.tab.tabs.find((t) => t.view === 'monitor')?.monitor?.targets).toBe('agent3');
  });

  it('group targets match tabs by group number', () => {
    const { monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'group', group: 2 }]);
    emitEntry(agent2, 'ls', 'x');
    emitEntry(janus, 'ls', 'y');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts[0]).toContain('agent2');
    expect(acp.prompts[0]).not.toContain('[janus]');
  });

  it('a tab created after start and joining the monitored group is picked up', () => {
    const { managers, monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'group', group: 2 }]);
    managers.tab.tabs = [...managers.tab.tabs, { ...makeTab('agent3', '#eee'), group: 2, groupColor: '#bbb' }];
    emitEntry(managers.tab.tabs.at(-1)!, 'echo', 'z');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts[0]).toContain('agent3');
  });

  it('rejects unknown targets, duplicate personas, and label collisions', () => {
    const { monitor } = harness([janus, makeTab('assistant', '#ccc')]);
    expect(monitor.start('janus', 'security', [{ kind: 'tab', label: 'ghost' }])).toMatch(/No tab named/);
    expect(monitor.start('janus', 'security', [{ kind: 'group', group: 9 }])).toMatch(/No group 9/);
    expect(monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'janus' }])).toMatch(/already exists/);
    expect(monitor.start('janus', 'security', [])).toBeNull();
    expect(monitor.start('janus', 'security', [])).toMatch(/Already monitoring/);
    expect(acp.calls).toHaveLength(0);
  });

  it('returns the unknown-role error and sends no prompt', () => {
    const { monitor } = harness([janus]);
    mocks.loadPersona.mockReturnValue({ name: 'security', role: 'ghost-role', body: 'Watch the shell.' });
    expect(monitor.start('janus', 'security', [])).toBe('Unknown role "ghost-role" in persona "security".');
    expect(acp.calls).toHaveLength(0);
    expect(monitor.list()).toEqual([]);
  });

  it('returns the no-models error and sends no prompt', () => {
    const { monitor } = harness([janus], () => false);
    expect(monitor.start('janus', 'security', [])).toBe('ACP: the ask role lists no models.');
    expect(acp.calls).toHaveLength(0);
    expect(monitor.list()).toEqual([]);
  });

  it('keeps the model manager as the receiver when filtering role entries', () => {
    const { managers } = harness([janus]);
    managers.models = new ReceiverAwareModels() as unknown as Managers['models'];
    const monitor = new MonitorManager(managers, FLUSH_MS);
    expect(monitor.start('janus', 'security', [])).toBeNull();
    expect(monitor.snapshot()).toHaveLength(1);
  });

  it('stop leaves the tab\'s core session alone and stops feeding', () => {
    const { appended, monitor } = harness([janus]);
    monitor.start('janus', 'security', []);
    expect(monitor.stop('janus', 'security')).toBe(true);
    expect(acp.closed).toEqual([]);
    emitEntry(janus, 'ls', 'x');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.calls).toHaveLength(0);
    expect(monitor.list()).toEqual([]);
    expect(appended).toEqual([]);
  });

  it('a flush error arriving after stop does not add a monitor error line', async () => {
    const { appended, monitor } = harness([janus]);
    monitor.start('janus', 'security', []);
    emitEntry(janus, 'ls', 'x');
    vi.advanceTimersByTime(FLUSH_MS);
    monitor.stop('janus', 'security');
    await acp.fail(0, 'ACP connection closed');
    expect(appended.some((a) => a.entry.output.includes('restarting monitor session'))).toBe(false);
    expect(monitor.list()).toEqual([]);
  });

  it('a flush reply arriving after stop does not reopen the reporting tab', async () => {
    const { managers, monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    emitEntry(agent2, 'ls', 'x');
    vi.advanceTimersByTime(FLUSH_MS);
    monitor.stop('janus', 'assistant');
    expect(managers.tab.monitorTab('assistant')).toBeUndefined();
    await acp.reply(0, '[SUGGESTION]: Late advice');
    expect(managers.tab.monitorTab('assistant')).toBeUndefined();
  });

  it('a core refusal settles the old prompt and the next batch sends the persona primer again', async () => {
    const { appended, monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    emitEntry(agent2, 'ls', 'x');
    vi.advanceTimersByTime(FLUSH_MS);
    await acp.fail(0, 'ACP connection closed');
    expect(acp.closed).toEqual([]);
    emitEntry(agent2, 'pwd', '/tmp');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts).toHaveLength(2);
    expect(acp.prompts[1]).toContain('[SUGGESTION]');
    expect(acp.prompts[1]).toContain('pwd');
    expect(appended.at(-1)?.entry.output).toContain('restarting monitor session');
  });

  it('an ask error arriving after stop finishes the running entry without touching the core session', async () => {
    const { finished, monitor } = harness([janus]);
    monitor.start('janus', 'security', []);
    expect(monitor.ask('janus', 'security', 'anything risky?')).toBeNull();
    monitor.stop('janus', 'security');
    await acp.fail(0, 'ACP connection closed');
    expect(acp.closed).toEqual([]);
    expect(finished.at(-1)?.output).toBe('monitor security: ACP connection closed — restarting monitor session');
  });

  it('snapshot returns one record per live monitor with name, persona, targets, and inline', () => {
    const { monitor } = harness([janus, agent2]);
    monitor.start('janus', 'security', []);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    expect(monitor.snapshot()).toEqual(expect.arrayContaining([
      { name: 'security', persona: 'security', targets: [{ kind: 'tab', label: 'janus' }], inline: true },
      { name: 'assistant', persona: 'assistant', targets: [{ kind: 'tab', label: 'agent2' }], inline: false },
    ]));
  });

  it('two same-persona monitors with different names both run from one owner', () => {
    const { managers, monitor } = harness([janus, agent2]);
    expect(monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }], 'watch-a')).toBeNull();
    expect(monitor.start('janus', 'assistant', [{ kind: 'group', group: 2 }], 'watch-b')).toBeNull();
    expect(monitor.list()).toHaveLength(2);
    const labels = managers.tab.tabs.filter((t) => t.view === 'monitor').map((t) => t.label);
    expect(labels).toEqual(expect.arrayContaining(['watch-a', 'watch-b']));
    expect(monitor.snapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'watch-a', persona: 'assistant' }),
      expect.objectContaining({ name: 'watch-b', persona: 'assistant' }),
    ]));
  });

  it('rejects a second monitor with the same owner and name', () => {
    const { monitor } = harness([janus, agent2]);
    expect(monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }], 'watch')).toBeNull();
    expect(monitor.start('janus', 'security', [{ kind: 'group', group: 2 }], 'watch')).toMatch(/Already monitoring/);
  });

  it('defaults a monitor started without a name to its persona', () => {
    const { monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    expect(monitor.snapshot()).toEqual([expect.objectContaining({ name: 'assistant', persona: 'assistant' })]);
    expect(monitor.stop('janus', 'assistant')).toBe(true);
  });

  it('snapshot returns an empty array when no monitors are running', () => {
    const { monitor } = harness([janus]);
    expect(monitor.snapshot()).toEqual([]);
  });

  it('closing the owner tab tears down its monitors and their reporting tabs', () => {
    const { managers, monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    expect(managers.tab.tabs.some((t) => t.view === 'monitor')).toBe(true);
    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'janus' });
    expect(acp.closed).toEqual([]);
    expect(monitor.list()).toEqual([]);
    expect(managers.tab.tabs.some((t) => t.view === 'monitor')).toBe(false);
  });

  it('closing the reporting tab stops feeding and leaves the core session alone', () => {
    const { managers, monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    const index = managers.tab.tabs.findIndex((t) => t.view === 'monitor');
    managers.tab.closeTab(index);
    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'assistant' });
    expect(acp.closed).toEqual([]);
    expect(monitor.list()).toEqual([]);
  });

  it('reopening the same owner/persona after its reporting tab closes succeeds', () => {
    const { managers, monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    const index = managers.tab.tabs.findIndex((t) => t.view === 'monitor');
    managers.tab.closeTab(index);
    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'assistant' });
    expect(monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }])).toBeNull();
  });

  it('closing every tab target closes the now-empty reporting tab', () => {
    const agent3 = makeTab('agent3', '#ccc');
    const { managers, monitor } = harness([janus, agent2, agent3]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }, { kind: 'tab', label: 'agent3' }]);
    expect(managers.tab.tabs.some((t) => t.view === 'monitor')).toBe(true);
    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'agent2' });
    expect(managers.tab.tabs.some((t) => t.view === 'monitor')).toBe(true);
    expect(acp.closed).toEqual([]);
    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'agent3' });
    expect(acp.closed).toEqual([]);
    expect(managers.tab.tabs.some((t) => t.view === 'monitor')).toBe(false);
  });

  it('keeps a reporting tab fed by another owner when one owner closes', () => {
    const { managers, monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    monitor.start('agent2', 'assistant', [{ kind: 'group', group: 1 }]);
    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'janus' });
    expect(managers.tab.tabs.some((t) => t.view === 'monitor' && t.label === 'assistant')).toBe(true);
    expect(monitor.list()).toHaveLength(1);
  });

  it('ask queries the core role session and lands the reply in the owner transcript', async () => {
    const { finished, monitor } = harness([janus]);
    monitor.start('janus', 'security', []);
    expect(monitor.ask('janus', 'security', 'what have you seen?')).toBeNull();
    expect(acp.prompts[0]).toContain('what have you seen?');
    expect(acp.prompts[0]).toContain('[SUGGESTION]');
    expect(acp.calls[0].role).toBe('ask');
    expect(acp.calls[0].label).toBe('janus');
    expect(monitor.ask('janus', 'security', 'again?')).toMatch(/busy/);
    await acp.reply(0, 'Nothing suspicious so far.');
    expect(finished).toEqual([{ label: 'janus', output: '💡 security: Nothing suspicious so far.' }]);
  });

  it('a prompt fired while the core role is busy settles with the refusal and leaves the active prompt untouched', async () => {
    const { managers, appended, monitor } = harness([janus]);
    monitor.start('janus', 'security', []);
    const active = managers.acp.promptResult('janus', 'ask held', 'ask');
    await Promise.resolve(); // let the fake register the competing call
    emitEntry(janus, 'ls', 'x');
    vi.advanceTimersByTime(FLUSH_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(appended.at(-1)?.entry.output).toBe('monitor security: ACP: a prompt is already running. — restarting monitor session');
    expect(acp.calls[0].prompt).toBe('ask held'); // active prompt untouched
    expect(acp.calls).toHaveLength(2);
    acp.calls[0].settle({ answered: true, reply: 'held answer', session: 's' });
    await active;
  });

  it('rating feeds back through the next batch and removes the suggestion either way', async () => {
    const { managers, monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    emitEntry(agent2, 'npm test', '1 failing');
    vi.advanceTimersByTime(FLUSH_MS);
    await acp.reply(0, '[SUGGESTION]: Fix the failing test');
    emitEntry(agent2, 'npm run lint', 'clean');
    vi.advanceTimersByTime(FLUSH_MS);
    await acp.reply(1, '[SUGGESTION]: Try the build next');
    const feed = managers.tab.tabs.find((t) => t.view === 'monitor')!.monitor!;
    const [first, second] = feed.suggestions.map((s) => s.id);
    monitor.rate(first, true);
    expect(feed.suggestions.map((s) => s.id)).toEqual([second]);
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts.at(-1)).toContain('helpful (thumbs up)');
    await acp.reply(2, 'OK');
    monitor.rate(second, false);
    expect(feed.suggestions).toHaveLength(0);
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts.at(-1)).toContain('not helpful (thumbs down)');
  });

  it('a failed core prompt appends the error line, clears inFlight, and keeps monitoring', async () => {
    const { appended, monitor } = harness([janus]);
    monitor.start('janus', 'security', []);
    emitEntry(janus, 'ls', 'x');
    vi.advanceTimersByTime(FLUSH_MS);
    await acp.fail(0, 'ACP connection closed');
    expect(appended.at(-1)?.entry.output).toContain('restarting monitor session');
    expect(acp.closed).toEqual([]);
    emitEntry(janus, 'pwd', '/tmp');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts).toHaveLength(2);
    expect(acp.prompts[1]).toContain('pwd');
  });

  it('a flush error with a rate-limit-shaped message fires a rate-limited notification', async () => {
    const { monitor } = harness([janus]);
    monitor.start('janus', 'security', []);
    mocks.notify.mockClear();
    emitEntry(janus, 'ls', 'x');
    vi.advanceTimersByTime(FLUSH_MS);
    await acp.fail(0, 'too many requests');
    expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), 'rate-limited', 'janus');
  });

  it('a flush error with an unrelated message does not fire a rate-limited notification', async () => {
    const { monitor } = harness([janus]);
    monitor.start('janus', 'security', []);
    mocks.notify.mockClear();
    emitEntry(janus, 'ls', 'x');
    vi.advanceTimersByTime(FLUSH_MS);
    await acp.fail(0, 'ACP connection closed');
    expect(mocks.notify).not.toHaveBeenCalledWith(expect.anything(), 'rate-limited', 'janus');
  });

  it('resetContext closes the core session and re-primes the next prompt', async () => {
    const { monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    emitEntry(agent2, 'ls', 'x');
    vi.advanceTimersByTime(FLUSH_MS);
    monitor.resetContext('assistant');
    expect(acp.closed).toEqual([{ label: 'janus', role: 'ask' }]);
    await acp.fail(0, 'ACP session closed.');
    emitEntry(agent2, 'pwd', '/tmp');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts[1]).toContain('[SUGGESTION]');
    expect(acp.prompts[1]).toContain('pwd');
  });

  it('a flush failure settled by resetContext writes no spurious monitor error line', async () => {
    const { appended, monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    emitEntry(agent2, 'ls', 'x');
    vi.advanceTimersByTime(FLUSH_MS);
    monitor.resetContext('assistant');
    await acp.fail(0, 'ACP session closed.');
    expect(appended.some((a) => a.entry.output.includes('restarting monitor session'))).toBe(false);
    emitEntry(agent2, 'pwd', '/tmp');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts[1]).toContain('[SUGGESTION]');
    expect(acp.prompts[1]).toContain('pwd');
  });

  it('a flush reply arriving after resetContext is ignored and the next flush keeps the primer', async () => {
    const { managers, monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    emitEntry(agent2, 'ls', 'x');
    vi.advanceTimersByTime(FLUSH_MS);
    monitor.resetContext('assistant');
    await acp.reply(0, '[SUGGESTION]: Stale advice from the old context');

    const feed = managers.tab.tabs.find((t) => t.view === 'monitor')!.monitor!;
    expect(feed.suggestions).toHaveLength(0);
    expect(monitor.transcript('assistant')).not.toContain('Stale advice from the old context');
    expect(monitor.transcript('assistant')).toContain('Reply using exactly one of these formats:');

    emitEntry(agent2, 'pwd', '/tmp');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts[1]).toContain('Reply using exactly one of these formats:');
    expect(acp.prompts[1]).toContain('pwd');
  });

  it('resetContext resets contextBytes back down after priming', () => {
    const { managers, monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    const before = managers.tab.tabs.find((t) => t.view === 'monitor')!.monitor!.contextBytes;
    monitor.resetContext('assistant');
    const after = managers.tab.tabs.find((t) => t.view === 'monitor')!.monitor!.contextBytes;
    expect(after).toBeLessThanOrEqual(before);
    expect(after).toBeGreaterThan(0);
  });

  it('resetContext is a no-op for a name with no matching monitor', () => {
    const { monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    expect(() => monitor.resetContext('ghost')).not.toThrow();
    expect(acp.closed).toEqual([]);
  });

  it('resetContext closes the core session for every owner sharing one reporting tab', () => {
    const { monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    monitor.start('agent2', 'assistant', [{ kind: 'group', group: 1 }]);
    monitor.resetContext('assistant');
    expect(acp.closed).toEqual(expect.arrayContaining([
      { label: 'janus', role: 'ask' }, { label: 'agent2', role: 'ask' },
    ]));
  });

  it('ask on an unknown monitor reports an error', () => {
    const { monitor } = harness([janus]);
    expect(monitor.ask('janus', 'security', 'hello?')).toMatch(/No "security" monitor/);
  });

  it('primes the buffer with existing transcript entries from a tab target', () => {
    const janusWithLog = makeTab('janus', '#aaa', 1, [], [{ input: 'ls', output: 'a b c' }, { input: 'pwd', output: '/tmp' }]);
    const { monitor } = harness([janusWithLog]);
    monitor.start('janus', 'security', []);
    emitEntry(janusWithLog, 'echo hello', 'hello');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts[0]).toContain('ls');
    expect(acp.prompts[0]).toContain('pwd');
    expect(acp.prompts[0]).toContain('echo hello');
  });

  it('primes the buffer with entries from an external tab target', () => {
    const tabs = [janus, makeTab('agent2', '#bbb', 1, [], [{ input: 'npm test', output: '1 failing' }])];
    const { monitor } = harness(tabs);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    emitEntry(tabs[1], 'npm run lint', 'clean');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts[0]).toContain('npm test');
    expect(acp.prompts[0]).toContain('npm run lint');
  });

  it('primes the buffer with entries from all members of a group target', () => {
    const member1 = { ...makeTab('agent2', '#bbb', 1, [], [{ input: 'ls', output: 'x' }]), group: 2, groupColor: '#bbb' };
    const member2 = { ...makeTab('agent3', '#ccc', 1, [], [{ input: 'pwd', output: '/tmp' }]), group: 2, groupColor: '#bbb' };
    const { monitor } = harness([janus, member1, member2]);
    monitor.start('janus', 'assistant', [{ kind: 'group', group: 2 }]);
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts[0]).toContain('[agent2]');
    expect(acp.prompts[0]).toContain('[agent3]');
    expect(acp.prompts[0]).toContain('ls');
    expect(acp.prompts[0]).toContain('pwd');
  });

  it('existing entries appear before new entries in the buffer', () => {
    const janusWithLog = makeTab('janus', '#aaa', 1, [], [{ input: 'existing', output: 'old' }]);
    const { monitor } = harness([janusWithLog]);
    monitor.start('janus', 'security', []);
    emitEntry(janusWithLog, 'new', 'fresh');
    vi.advanceTimersByTime(FLUSH_MS);
    const prompt = acp.prompts[0];
    expect(prompt.indexOf('existing')).toBeLessThan(prompt.indexOf('new'));
  });

  it('seeds a harness target with its current rendered screen', () => {
    const claude = harnessTab('claude');
    const { screens, monitor } = harness([janus, claude]);
    screens.claude = { text: 'on-screen output', capturedAt: 100 };
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'claude' }]);
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts[0]).toContain('[claude]');
    expect(acp.prompts[0]).toContain('on-screen output');
  });

  it('feeds a harness target\'s new screen on flush, tagged with the tab label', async () => {
    const claude = harnessTab('claude');
    const { screens, monitor } = harness([janus, claude]);
    screens.claude = { text: 'first screen', capturedAt: 100 };
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'claude' }]);
    vi.advanceTimersByTime(FLUSH_MS);
    await acp.reply(0, 'no suggestion');
    screens.claude = { text: 'second screen', capturedAt: 200 };
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts.at(-1)).toContain('second screen');
    expect(acp.prompts.at(-1)).toContain('[claude]');
  });

  it('does not prompt when a harness target is idle (no new capture)', async () => {
    const claude = harnessTab('claude');
    const { screens, monitor } = harness([janus, claude]);
    screens.claude = { text: 'steady screen', capturedAt: 100 };
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'claude' }]);
    vi.advanceTimersByTime(FLUSH_MS);
    await acp.reply(0, 'no suggestion');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts).toHaveLength(1);
  });

  it('seeds a harness target with its session transcript as well as its screen, transcript first', () => {
    const claude = harnessTab('claude');
    const { screens, transcripts, monitor } = harness([janus, claude]);
    screens.claude = { text: 'on-screen output', capturedAt: 100 };
    transcripts.claude = ['[Explore: find the config] user: search the repo'];
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'claude' }]);
    vi.advanceTimersByTime(FLUSH_MS);
    const prompt = acp.prompts[0];
    expect(prompt).toContain('[Explore: find the config] user: search the repo');
    expect(prompt).toContain('on-screen output');
    expect(prompt.indexOf('search the repo')).toBeLessThan(prompt.indexOf('on-screen output'));
  });

  it('feeds a harness target\'s new transcript entries on flush', async () => {
    const claude = harnessTab('claude');
    const { screens, transcripts, monitor } = harness([janus, claude]);
    screens.claude = { text: 'steady screen', capturedAt: 100 };
    transcripts.claude = ['user: first turn'];
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'claude' }]);
    vi.advanceTimersByTime(FLUSH_MS);
    await acp.reply(0, 'no suggestion');
    transcripts.claude.push('assistant → Read({"file_path":"/a.ts"})');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts.at(-1)).toContain('assistant → Read({"file_path":"/a.ts"})');
    expect(acp.prompts.at(-1)).not.toContain('user: first turn');
  });

  it('feeds an editor target its file content on seed and a diff on change', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'janus-monitor-editor-'));
    const file = path.join(dir, 'notes.txt');
    writeFileSync(file, 'first content\n');
    const { openFiles, monitor } = harness([janus, editorTab('notes', 'e1')]);
    openFiles.set('e1', file);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'notes' }]);
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts[0]).toContain('[notes]');
    expect(acp.prompts[0]).toContain('first content');
    await acp.reply(0, 'no suggestion');
    writeFileSync(file, 'second content\n');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts.at(-1)).toContain('-first content');
    expect(acp.prompts.at(-1)).toContain('+second content');
    await acp.reply(1, 'no suggestion');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts).toHaveLength(2);
    rmSync(dir, { recursive: true, force: true });
  });

  it('feeds a page target its visible-text snapshot on seed and a diff on change', async () => {
    const site = pageTab('site');
    const { monitor } = harness([janus, site]);
    monitor.start('janus', 'assistant', [{ kind: 'tab', label: 'site' }]);
    site.pageSnapshot = { text: 'first visible text', capturedAt: Date.now() };
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts[0]).toContain('[site]');
    expect(acp.prompts[0]).toContain('first visible text');
    await acp.reply(0, 'no suggestion');
    site.pageSnapshot = { text: 'second visible text', capturedAt: Date.now() };
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts.at(-1)).toContain('-first visible text');
    expect(acp.prompts.at(-1)).toContain('+second visible text');
    await acp.reply(1, 'no suggestion');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(acp.prompts).toHaveLength(2);
  });

  it('lists monitors with mode and delivery counts', async () => {
    const { monitor } = harness([janus, agent2]);
    monitor.start('janus', 'security', []);
    monitor.start('janus', 'assistant', [{ kind: 'group', group: 2 }]);
    emitEntry(janus, 'ls', 'x');
    vi.advanceTimersByTime(FLUSH_MS);
    await acp.reply(0, '[SUGGESTION]: something');
    expect(monitor.list()).toEqual([
      'security: janus ← janus (inline, 1 suggestion)',
      'assistant: group:2 ← janus (external, 0 suggestions)',
    ]);
  });

  it('lists a profile-named monitor by its name, with the persona beside it', () => {
    const { monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'group', group: 2 }], 'nightly-watch');
    expect(monitor.list()).toEqual([
      'nightly-watch (persona: assistant): group:2 ← janus (external, 0 suggestions)',
    ]);
  });

  it('names the runtime name in both the connections row text and its acpRef', () => {
    const { monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'group', group: 2 }], 'nightly-watch');
    expect(monitor.connectionsFor('janus')).toEqual([
      { text: 'monitor:nightly-watch', kind: 'acp', acpRef: { scope: 'monitor', name: 'nightly-watch' } },
    ]);
  });

  it('stops and questions a profile-named monitor by that name', async () => {
    const { monitor } = harness([janus, agent2]);
    monitor.start('janus', 'assistant', [{ kind: 'group', group: 2 }], 'nightly-watch');
    expect(monitor.namesFor('janus')).toEqual(['nightly-watch']);
    expect(monitor.ask('janus', 'assistant', 'anything?')).toMatch(/No "assistant" monitor/);
    expect(monitor.ask('janus', 'nightly-watch', 'anything?')).toBeNull();
    await acp.reply(0, 'All quiet.');
    expect(monitor.stop('janus', 'nightly-watch')).toBe(true);
    expect(monitor.list()).toEqual([]);
  });
});
