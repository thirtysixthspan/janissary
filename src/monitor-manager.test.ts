import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { LogEntry, Tab } from './types.js';
import type { Managers } from './managers.js';
import { makeTab } from './tab.js';
import { messageBus } from './bus.js';
import { MonitorManager } from './monitor-manager.js';
import { writeCaptureFile } from './harness-capture-file.js';
import type * as monitorAcp from './monitor-acp.js';

vi.mock('./harness-capture-file.js', () => ({
  writeCaptureFile: vi.fn(() => '/project/.janissary/captures/assistant-now.txt'),
  initHarnessCaptureDirectory: vi.fn(),
  ensureCaptureDirectory: vi.fn(),
  clearCaptureDirectory: vi.fn(),
}));

// Fake ACP sessions: capture prompts, let the test stream the reply. The priming prompt
// (persona body) completes immediately so flushes are not held off.
type FakeSession = {
  prompts: string[];
  reply: (text: string) => void;
  fail: (message: string) => void;
  kill: ReturnType<typeof vi.fn>;
};

function makeFakeManagers(tabs: Tab[]) {
  const appended: { label: string; entry: LogEntry }[] = [];
  const finished: { label: string; output: string }[] = [];
  const screens: Record<string, { text: string; capturedAt: number } | undefined> = {};
  const fakeTab = {
    tabs,
    cwdOf: () => '/tmp',
    cur: () => tabs[0],
    append: (label: string, entry: LogEntry) => { appended.push({ label, entry }); },
    startRunning: () => {},
    finishRunning: (label: string, output: string) => { finished.push({ label, output }); },
    // openMonitorTab reassigns `tabs`, so splice the live array, not the closure's original.
    closeTab: (index: number) => { fakeTab.tabs.splice(index, 1); },
  };
  const edit = vi.fn();
  const managers = {
    tab: fakeTab,
    harness: { latestScreenText: (label: string) => screens[label] },
    openFile: { edit },
  } as unknown as Managers;
  return { managers, appended, finished, screens, edit };
}

function harnessTab(label: string): Tab {
  return { ...makeTab(label, '#aaa'), view: 'harness' } as Tab;
}

function fakeSpawnFactory() {
  const sessions: FakeSession[] = [];
  const spawn = (() => {
    const session: FakeSession = { prompts: [], reply: () => {}, fail: () => {}, kill: vi.fn() };
    sessions.push(session);
    return {
      prompt: (text: string, handlers: { onChunk: (t: string) => void; onEnd: (r: string) => void; onError: (m: string) => void }) => {
        session.prompts.push(text);
        if (session.prompts.length === 1) { handlers.onEnd('end'); return; } // priming
        session.reply = (replyText: string) => { handlers.onChunk(replyText); handlers.onEnd('end'); };
        session.fail = (message: string) => { handlers.onError(message); };
      },
      kill: session.kill,
    };
  }) as unknown as typeof monitorAcp.spawnMonitorSession;
  return { spawn, sessions };
}

function emitEntry(tab: Tab, input: string, output: string): void {
  messageBus.emit('transcript', { type: 'entry:appended', tabLabel: tab.label, entry: { input, output }, tab });
}

const FLUSH_MS = 1000;

let janus: Tab;
let agent2: Tab;

beforeEach(() => {
  vi.useFakeTimers();
  janus = makeTab('janus', '#aaa');
  agent2 = { ...makeTab('agent2', '#bbb'), group: 2, groupColor: '#bbb' };
});

afterEach(() => {
  vi.useRealTimers();
  messageBus.clear();
});

describe('MonitorManager', () => {
  it('inline mode: watches the owner tab and appends suggestions to its transcript', () => {
    const { managers, appended } = makeFakeManagers([janus]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);

    expect(manager.start('janus', 'security', [])).toBeNull();
    expect(sessions[0].prompts[0]).toContain('[SUGGESTION]'); // persona priming includes format

    emitEntry(janus, 'cat .env', 'SECRET=hunter2');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(sessions[0].prompts[1]).toContain('cat .env');
    sessions[0].reply('[SUGGESTION]: Rotate that secret\n[COMMAND]: shell git status');
    expect(appended).toHaveLength(1);
    expect(appended[0].label).toBe('janus');
    expect(appended[0].entry.output).toBe('💡 security: Rotate that secret\nshell git status');
  });

  it('skips the flush entirely when no new transcripts arrived', () => {
    const { managers } = makeFakeManagers([janus]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'security', []);

    vi.advanceTimersByTime(FLUSH_MS * 3);
    expect(sessions[0].prompts).toHaveLength(1); // only the priming prompt
  });

  it('batches multiple entries into one prompt per tick', () => {
    const { managers } = makeFakeManagers([janus]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'security', []);

    emitEntry(janus, 'ls', 'a b c');
    emitEntry(janus, 'pwd', '/tmp');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(sessions[0].prompts).toHaveLength(2);
    expect(sessions[0].prompts[1]).toContain('ls');
    expect(sessions[0].prompts[1]).toContain('pwd');
  });

  it('never feeds a monitor its own inline suggestions', () => {
    const { managers } = makeFakeManagers([janus]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'security', []);

    emitEntry(janus, '', '💡 security: previous suggestion');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(sessions[0].prompts).toHaveLength(1);
  });

  it('external mode: delivers into the persona reporting tab colored after the target', () => {
    const tabs = [janus, agent2];
    const { managers } = makeFakeManagers(tabs);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);

    expect(manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }])).toBeNull();
    // The reporting tab opens immediately on start, before any suggestion arrives.
    expect(managers.tab.tabs.find((t) => t.view === 'monitor')?.monitor?.suggestions).toEqual([]);

    emitEntry(agent2, 'npm test', '1 failing');
    vi.advanceTimersByTime(FLUSH_MS);
    sessions[0].reply('[SUGGESTION]: Fix the failing test');

    const monitorTab = managers.tab.tabs.find((t) => t.view === 'monitor');
    expect(monitorTab?.label).toBe('assistant');
    expect(monitorTab?.dotColor).toBe('#bbb');
    expect(monitorTab?.monitor?.suggestions).toHaveLength(1);
    expect(monitorTab?.monitor?.suggestions[0]).toMatchObject({ text: 'Fix the failing test', about: 'agent2' });
  });

  it('sets the reporting tab\'s persona, targets, and an initial contextBytes from priming', () => {
    const { managers } = makeFakeManagers([janus, agent2]);
    const { spawn } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);

    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);

    const monitorTab = managers.tab.tabs.find((t) => t.view === 'monitor');
    expect(monitorTab?.monitor?.persona).toBe('assistant');
    expect(monitorTab?.monitor?.targets).toBe('agent2');
    expect(monitorTab?.monitor?.contextBytes).toBeGreaterThan(0);
  });

  it('increases contextBytes further after a flush', () => {
    const { managers } = makeFakeManagers([janus, agent2]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    const before = managers.tab.tabs.find((t) => t.view === 'monitor')!.monitor!.contextBytes;

    emitEntry(agent2, 'npm test', '1 failing');
    vi.advanceTimersByTime(FLUSH_MS);
    sessions[0].reply('[SUGGESTION]: Fix the failing test');

    const after = managers.tab.tabs.find((t) => t.view === 'monitor')!.monitor!.contextBytes;
    expect(after).toBeGreaterThan(before);
  });

  it('snapshotContext writes the accumulated context to a file and opens it in an editor tab', () => {
    const { managers, edit } = makeFakeManagers([janus, agent2]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    emitEntry(agent2, 'npm test', '1 failing');
    vi.advanceTimersByTime(FLUSH_MS);
    sessions[0].reply('[SUGGESTION]: Fix the failing test');
    vi.mocked(writeCaptureFile).mockClear();

    manager.snapshotContext('assistant');

    expect(writeCaptureFile).toHaveBeenCalledTimes(1);
    const [label, , text] = vi.mocked(writeCaptureFile).mock.calls[0];
    expect(label).toBe('assistant');
    expect(text).toContain('[SUGGESTION]'); // persona priming
    expect(text).toContain('npm test'); // flushed update prompt
    expect(text).toContain('Fix the failing test'); // reply
    expect(edit).toHaveBeenCalledWith('monitor context assistant', '/project/.janissary/captures/assistant-now.txt', 'janus');
  });

  it('snapshotContext is a no-op for an unknown reporting tab', () => {
    const { managers, edit } = makeFakeManagers([janus, agent2]);
    const { spawn } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    vi.mocked(writeCaptureFile).mockClear();

    manager.snapshotContext('nonexistent');

    expect(writeCaptureFile).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });

  it('dropping one of two tab targets updates targets to the remaining one without closing the tab', () => {
    const agent3 = makeTab('agent3', '#ccc');
    const { managers } = makeFakeManagers([janus, agent2, agent3]);
    const { spawn } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }, { kind: 'tab', label: 'agent3' }]);

    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'agent2' });

    const monitorTab = managers.tab.tabs.find((t) => t.view === 'monitor');
    expect(monitorTab).toBeDefined();
    expect(monitorTab?.monitor?.targets).toBe('agent3');
  });

  it('group targets match tabs by group number', () => {
    const { managers } = makeFakeManagers([janus, agent2]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'assistant', [{ kind: 'group', group: 2 }]);

    emitEntry(agent2, 'ls', 'x'); // group 2 → buffered
    emitEntry(janus, 'ls', 'y');  // group 1 → ignored
    vi.advanceTimersByTime(FLUSH_MS);
    expect(sessions[0].prompts[1]).toContain('agent2');
    expect(sessions[0].prompts[1]).not.toContain('[janus]');
  });

  it('rejects unknown targets, duplicate personas, and label collisions', () => {
    const { managers } = makeFakeManagers([janus, { ...makeTab('assistant', '#ccc') }]);
    const { spawn } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);

    expect(manager.start('janus', 'security', [{ kind: 'tab', label: 'ghost' }])).toMatch(/No tab named/);
    expect(manager.start('janus', 'security', [{ kind: 'group', group: 9 }])).toMatch(/No group 9/);
    expect(manager.start('janus', 'assistant', [{ kind: 'tab', label: 'janus' }])).toMatch(/already exists/);
    expect(manager.start('janus', 'security', [])).toBeNull();
    expect(manager.start('janus', 'security', [])).toMatch(/Already monitoring/);
  });

  it('stop kills the dedicated session and stops feeding', () => {
    const { managers } = makeFakeManagers([janus]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'security', []);

    expect(manager.stop('janus', 'security')).toBe(true);
    expect(sessions[0].kill).toHaveBeenCalled();
    emitEntry(janus, 'ls', 'x');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(sessions[0].prompts).toHaveLength(1);
    expect(manager.list()).toEqual([]);
  });

  it('closing the owner tab tears down its monitors and their reporting tabs', () => {
    const { managers } = makeFakeManagers([janus, agent2]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    expect(managers.tab.tabs.some((t) => t.view === 'monitor')).toBe(true);

    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'janus' });
    expect(sessions[0].kill).toHaveBeenCalled();
    expect(manager.list()).toEqual([]);
    expect(managers.tab.tabs.some((t) => t.view === 'monitor')).toBe(false);
  });

  it('closing the reporting tab kills its session and stops feeding', () => {
    const { managers } = makeFakeManagers([janus, agent2]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    const monitorIndex = managers.tab.tabs.findIndex((t) => t.view === 'monitor');

    managers.tab.closeTab(monitorIndex);
    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'assistant' });

    expect(sessions[0].kill).toHaveBeenCalled();
    expect(manager.list()).toEqual([]);
  });

  it('reopening the same owner/persona after its reporting tab closes succeeds', () => {
    const { managers } = makeFakeManagers([janus, agent2]);
    const { spawn } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    const monitorIndex = managers.tab.tabs.findIndex((t) => t.view === 'monitor');

    managers.tab.closeTab(monitorIndex);
    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'assistant' });

    expect(manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }])).toBeNull();
  });

  it('closing every tab target closes the now-empty reporting tab', () => {
    const agent3 = makeTab('agent3', '#ccc');
    const { managers } = makeFakeManagers([janus, agent2, agent3]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }, { kind: 'tab', label: 'agent3' }]);
    expect(managers.tab.tabs.some((t) => t.view === 'monitor')).toBe(true);

    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'agent2' });
    expect(managers.tab.tabs.some((t) => t.view === 'monitor')).toBe(true); // one target remains
    expect(sessions[0].kill).not.toHaveBeenCalled();

    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'agent3' });
    expect(sessions[0].kill).toHaveBeenCalled();
    expect(managers.tab.tabs.some((t) => t.view === 'monitor')).toBe(false);
  });

  it('keeps a reporting tab fed by another owner when one owner closes', () => {
    const { managers } = makeFakeManagers([janus, agent2]);
    const { spawn } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    manager.start('agent2', 'assistant', [{ kind: 'group', group: 1 }]);

    messageBus.emit('transcript', { type: 'tab:removed', tabLabel: 'janus' });
    // agent2's assistant monitor still feeds the tab, so it stays open.
    expect(managers.tab.tabs.some((t) => t.view === 'monitor' && t.label === 'assistant')).toBe(true);
    expect(manager.list()).toHaveLength(1);
  });

  it('ask queries the monitor session and lands the reply in the owner transcript', () => {
    const { managers, finished } = makeFakeManagers([janus]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'security', []);

    expect(manager.ask('janus', 'security', 'what have you seen?')).toBeNull();
    expect(sessions[0].prompts[1]).toContain('what have you seen?');
    // Busy while the question streams; buffered entries stay queued.
    expect(manager.ask('janus', 'security', 'again?')).toMatch(/busy/);
    sessions[0].reply('Nothing suspicious so far.');
    expect(finished).toEqual([{ label: 'janus', output: '💡 security: Nothing suspicious so far.' }]);
  });

  it('rating feeds back through the next batch and removes the suggestion either way', () => {
    const { managers } = makeFakeManagers([janus, agent2]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);

    emitEntry(agent2, 'npm test', '1 failing');
    vi.advanceTimersByTime(FLUSH_MS);
    sessions[0].reply('[SUGGESTION]: Fix the failing test');
    emitEntry(agent2, 'npm run lint', 'clean');
    vi.advanceTimersByTime(FLUSH_MS);
    sessions[0].reply('[SUGGESTION]: Try the build next');
    const feed = managers.tab.tabs.find((t) => t.view === 'monitor')!.monitor!;
    const [first, second] = feed.suggestions.map((s) => s.id);

    manager.rate(first, true);
    expect(feed.suggestions.map((s) => s.id)).toEqual([second]); // thumbs-up removes too
    vi.advanceTimersByTime(FLUSH_MS);
    expect(sessions[0].prompts.at(-1)).toContain('helpful (thumbs up)');
    sessions[0].reply('OK');

    manager.rate(second, false);
    expect(feed.suggestions).toHaveLength(0);
    vi.advanceTimersByTime(FLUSH_MS);
    expect(sessions[0].prompts.at(-1)).toContain('not helpful (thumbs down)');
  });

  it('restarts the session after a prompt error and keeps monitoring', () => {
    const { managers, appended } = makeFakeManagers([janus]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'security', []);

    emitEntry(janus, 'ls', 'x');
    vi.advanceTimersByTime(FLUSH_MS);
    sessions[0].fail('ACP connection closed');

    expect(appended.at(-1)?.entry.output).toContain('restarting monitor session');
    expect(sessions[0].kill).toHaveBeenCalled();
    expect(sessions).toHaveLength(2);
    expect(sessions[1].prompts[0]).toContain('[SUGGESTION]'); // re-primed

    emitEntry(janus, 'pwd', '/tmp');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(sessions[1].prompts).toHaveLength(2); // fresh session keeps flushing
  });

  it('resetContext respawns the session and re-primes it', () => {
    const { managers } = makeFakeManagers([janus, agent2]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);

    manager.resetContext('assistant');

    expect(sessions[0].kill).toHaveBeenCalledTimes(1);
    expect(sessions).toHaveLength(2);
    expect(sessions[1].prompts[0]).toContain('[SUGGESTION]'); // re-primed
  });

  it('resetContext resets contextBytes back down after priming', () => {
    const { managers } = makeFakeManagers([janus, agent2]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    emitEntry(agent2, 'npm test', '1 failing');
    vi.advanceTimersByTime(FLUSH_MS);
    sessions[0].reply('[SUGGESTION]: Fix the failing test');
    const before = managers.tab.tabs.find((t) => t.view === 'monitor')!.monitor!.contextBytes;

    manager.resetContext('assistant');

    const after = managers.tab.tabs.find((t) => t.view === 'monitor')!.monitor!.contextBytes;
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0); // re-primed, not zeroed on the tab
  });

  it('resetContext is a no-op for a name with no matching monitor', () => {
    const { managers } = makeFakeManagers([janus, agent2]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);

    expect(() => manager.resetContext('ghost')).not.toThrow();
    expect(sessions).toHaveLength(1);
  });

  it('resetContext respawns every owner sharing one reporting tab', () => {
    const { managers } = makeFakeManagers([janus, agent2]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);
    manager.start('agent2', 'assistant', [{ kind: 'group', group: 1 }]);

    manager.resetContext('assistant');

    expect(sessions[0].kill).toHaveBeenCalledTimes(1);
    expect(sessions[1].kill).toHaveBeenCalledTimes(1);
    expect(sessions).toHaveLength(4); // both original sessions respawned
  });

  it('ask on an unknown monitor reports an error', () => {
    const { managers } = makeFakeManagers([janus]);
    const { spawn } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    expect(manager.ask('janus', 'security', 'hello?')).toMatch(/No "security" monitor/);
  });

  it('primes the buffer with existing transcript entries from a tab target', () => {
    const janusWithLog = makeTab('janus', '#aaa', 1, [], [{ input: 'ls', output: 'a b c' }, { input: 'pwd', output: '/tmp' }]);
    const { managers } = makeFakeManagers([janusWithLog]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);

    manager.start('janus', 'security', []);
    expect(sessions[0].prompts[0]).toContain('[SUGGESTION]');

    emitEntry(janusWithLog, 'echo hello', 'hello');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(sessions[0].prompts[1]).toContain('ls');
    expect(sessions[0].prompts[1]).toContain('pwd');
    expect(sessions[0].prompts[1]).toContain('echo hello');
  });

  it('primes the buffer with entries from an external tab target', () => {
    const tabs = [janus, makeTab('agent2', '#bbb', 1, [], [{ input: 'npm test', output: '1 failing' }])];
    const { managers } = makeFakeManagers(tabs);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);

    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'agent2' }]);

    emitEntry(tabs[1], 'npm run lint', 'clean');
    vi.advanceTimersByTime(FLUSH_MS);
    expect(sessions[0].prompts[1]).toContain('npm test');
    expect(sessions[0].prompts[1]).toContain('npm run lint');
  });

  it('primes the buffer with entries from all members of a group target', () => {
    const member1 = { ...makeTab('agent2', '#bbb', 1, [], [{ input: 'ls', output: 'x' }]), group: 2, groupColor: '#bbb' };
    const member2 = { ...makeTab('agent3', '#ccc', 1, [], [{ input: 'pwd', output: '/tmp' }]), group: 2, groupColor: '#bbb' };
    const { managers } = makeFakeManagers([janus, member1, member2]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);

    manager.start('janus', 'assistant', [{ kind: 'group', group: 2 }]);

    vi.advanceTimersByTime(FLUSH_MS);
    expect(sessions[0].prompts[1]).toContain('[agent2]');
    expect(sessions[0].prompts[1]).toContain('[agent3]');
    expect(sessions[0].prompts[1]).toContain('ls');
    expect(sessions[0].prompts[1]).toContain('pwd');
  });

  it('existing entries appear before new entries in the buffer', () => {
    const janusWithLog = makeTab('janus', '#aaa', 1, [], [{ input: 'existing', output: 'old' }]);
    const { managers } = makeFakeManagers([janusWithLog]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);

    manager.start('janus', 'security', []);
    emitEntry(janusWithLog, 'new', 'fresh');
    vi.advanceTimersByTime(FLUSH_MS);

    const prompt = sessions[0].prompts[1];
    const existingIndex = prompt.indexOf('existing');
    const newIndex = prompt.indexOf('new');
    expect(existingIndex).toBeLessThan(newIndex);
  });

  it('seeds a harness target with its current rendered screen', () => {
    const claude = harnessTab('claude');
    const { managers, screens } = makeFakeManagers([janus, claude]);
    screens.claude = { text: 'on-screen output', capturedAt: 100 };
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);

    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'claude' }]);
    vi.advanceTimersByTime(FLUSH_MS);
    expect(sessions[0].prompts[1]).toContain('[claude]');
    expect(sessions[0].prompts[1]).toContain('on-screen output');
  });

  it('feeds a harness target\'s new screen on flush, tagged with the tab label', () => {
    const claude = harnessTab('claude');
    const { managers, screens } = makeFakeManagers([janus, claude]);
    screens.claude = { text: 'first screen', capturedAt: 100 };
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);

    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'claude' }]);
    vi.advanceTimersByTime(FLUSH_MS); // flushes the seeded first screen
    sessions[0].reply('no suggestion'); // complete the prompt so inFlight clears
    screens.claude = { text: 'second screen', capturedAt: 200 };
    vi.advanceTimersByTime(FLUSH_MS);
    expect(sessions[0].prompts.at(-1)).toContain('second screen');
    expect(sessions[0].prompts.at(-1)).toContain('[claude]');
  });

  it('does not prompt when a harness target is idle (no new capture)', () => {
    const claude = harnessTab('claude');
    const { managers, screens } = makeFakeManagers([janus, claude]);
    screens.claude = { text: 'steady screen', capturedAt: 100 };
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);

    manager.start('janus', 'assistant', [{ kind: 'tab', label: 'claude' }]);
    vi.advanceTimersByTime(FLUSH_MS); // flushes the seeded screen (priming + 1)
    sessions[0].reply('no suggestion'); // complete the prompt so inFlight clears
    vi.advanceTimersByTime(FLUSH_MS); // idle: same capturedAt → buffer empty → no new prompt
    expect(sessions[0].prompts).toHaveLength(2);
  });

  it('lists monitors with mode and delivery counts', () => {
    const { managers } = makeFakeManagers([janus, agent2]);
    const { spawn, sessions } = fakeSpawnFactory();
    const manager = new MonitorManager(managers, spawn, FLUSH_MS);
    manager.start('janus', 'security', []);
    manager.start('janus', 'assistant', [{ kind: 'group', group: 2 }]);

    emitEntry(janus, 'ls', 'x');
    vi.advanceTimersByTime(FLUSH_MS);
    sessions[0].reply('[SUGGESTION]: something');

    expect(manager.list()).toEqual([
      'security: janus ← janus (inline, 1 suggestion)',
      'assistant: group:2 ← janus (external, 0 suggestions)',
    ]);
  });
});
