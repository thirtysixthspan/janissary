import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messageBus } from '../bus.js';
import { wireControllerEvents } from '../controller/events.js';
import { HarnessManager } from '../harness/manager.js';
import { placeAgent } from '../profile/place-agent.js';
import { MANAGER_TAB_RELEASE, type Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import { PseudoterminalManager } from '../pseudoterminal-manager.js';
import { spawnPty, type PtyHandlers } from '../pty.js';
import { RemoteManager } from '../remote/manager.js';
import { REMOTE_SHUTDOWN_DRAIN_MS } from '../remote/shutdown-drain.js';
import { decodeFrame, encodeFrame, encodeHandshake, type ClientFrame, type ServerFrame } from '../remote/protocol.js';
import { RemoteProcesses } from '../remote/serve-processes.js';
import { TabManager } from '../tab/manager.js';
import { TranscriptStore } from '../transcript/store.js';
import { PROVISION_FAILURE_CLOSE_DELAY_MS } from '../workspace/provision-wire.js';
import { SessionsManager } from './manager.js';
import type { RemoteSessionRecord } from './store.js';

const saved = vi.hoisted(() => ({ records: [] as RemoteSessionRecord[] }));
vi.mock(import('./store.js'), async (importOriginal) => ({
  ...await importOriginal(),
  loadRemoteSessions: () => structuredClone(saved.records),
  saveRemoteSessions: (records: RemoteSessionRecord[]) => { saved.records = structuredClone(records); },
}));
vi.mock('../pty.js', () => ({ spawnPty: vi.fn() }));
vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));
vi.mock('../harness/observers.js', () => ({ harnessRuntime: () => ({ dispose: vi.fn() }) }));
vi.mock('../harness/scratch-dir.js', () => ({ harnessSpawnEnv: () => ({}) }));
vi.mock('../file-navigator/remote-file-cache.js', () => ({ clearRemoteFileCacheForWorkspace: vi.fn() }));
vi.mock(import('../agent/state.js'), async (importOriginal) => ({
  ...await importOriginal(), deleteAgentState: vi.fn(),
}));

const SESSION = '11111111-2222-3333-4444-555555555555';
const WORKSPACE = '/remote-only/project/.janissary/workspace/claude';
type Transport = { id: string; handlers: PtyHandlers; connected: boolean };
let managers: Managers;

function harness() {
  const transports: Transport[] = [];
  const frames: ClientFrame[] = [];
  const remoteKills = vi.fn();
  const remoteSpawns = vi.fn();
  const emit = (frame: ServerFrame) => {
    const transport = transports.at(-1);
    if (transport?.connected) transport.handlers.onData(transport.id, `${encodeFrame(frame)}\n`);
  };
  const processes = new RemoteProcesses(emit, WORKSPACE, 'claude');
  vi.mocked(spawnPty).mockImplementation((program, _command, cwd, handlers) => {
    if (program !== 'ssh') {
      remoteSpawns();
      return {
        id: 'remote-harness', program, write: vi.fn(), resize: vi.fn(),
        kill: () => { remoteKills(); handlers.onExit('remote-harness', 0); },
      };
    }
    expect(cwd).toBe(process.cwd());
    const transport: Transport = { id: `ssh-${transports.length}`, handlers, connected: true };
    transports.push(transport);
    setTimeout(() => {
      handlers.onData(transport.id, `${encodeHandshake('/remote-only/project', SESSION)}\n`);
    }, 0);
    return {
      id: transport.id, program, resize: vi.fn(),
      kill: () => {
        transport.connected = false;
        setTimeout(() => { handlers.onExit(transport.id, 0); }, 0);
      },
      write: (data: string) => {
        if (!transport.connected) return;
        const frame = decodeFrame(data.trim());
        if (!('type' in frame)) throw new Error(frame.error);
        frames.push(frame as ClientFrame);
        switch (frame.type) {
          case 'provision': { setTimeout(() => { emit({ type: 'workspace-ready', dir: WORKSPACE }); }, 0); break; }
          case 'attach': { setTimeout(() => { emit({ type: 'attach-result', accepted: true }); }, 0); break; }
          case 'session-state': { setTimeout(() => { emit({ type: 'session-state-result', processes: processes.states() }); }, 0); break; }
          case 'spawn': { processes.spawn(frame); break; }
          case 'kill': { processes.kill(frame.id); break; }
          case 'shutdown': { processes.killAll(); break; }
        }
      },
    };
  });
  managers = Object.fromEntries(MANAGER_TAB_RELEASE.map((key) => [key, { closeTab: vi.fn() }])) as unknown as Managers;
  managers.database.closeAll = vi.fn();
  managers.schedule.get = vi.fn(() => []);
  managers.shell.releaseAdoptedShell = vi.fn();
  managers.tab = new TabManager(managers, process.cwd());
  vi.spyOn(managers.tab, 'persist').mockImplementation(() => {});
  managers.pty = new PseudoterminalManager(managers);
  managers.remote = new RemoteManager(managers);
  managers.harness = new HarnessManager(managers);
  managers.sessions = new SessionsManager(managers);
  wireControllerEvents(managers, { emitState: vi.fn(), sendPty: vi.fn(), sendPtyExit: vi.fn() });
  return { transports, frames, processes, remoteKills, remoteSpawns };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  saved.records = [];
  vi.spyOn(TranscriptStore, 'remove').mockImplementation(() => {});
});

afterEach(() => {
  messageBus.clear();
  managers.sessions.dispose();
  managers.harness.dispose();
  managers.remote.dispose();
  managers.pty.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function launch() {
  const fixture = harness();
  expect(managers.harness.run('harness claude on devbox')).toBeUndefined();
  await vi.advanceTimersByTimeAsync(10);
  expect(managers.tab.harnessTab('claude')?.harness.status).toBe('running');
  expect(managers.sessions.view()).toMatchObject([{ state: 'active', kind: 'harness' }]);
  return fixture;
}

describe('harness sessions round trip', () => {
  it('keeps a joined tab connected until its final release', async () => {
    const h = await launch();
    const creator = managers.tab.byLabel('claude')!;
    expect(managers.remote.attach('joined', 'claude')).toBe(true);
    placeAgent(managers, { resolved: 'joined', creator, cwd: WORKSPACE, offline: false, remote: creator.remote });
    h.frames.length = 0;
    managers.tab.closeTab(managers.tab.findIndex('claude'));
    await vi.advanceTimersByTimeAsync(10);
    expect(h.transports[0].connected).toBe(true);
    expect(managers.remote.get('joined')?.attached).toBe(true);
    expect(h.frames).not.toContainEqual({ type: 'shutdown' });
    managers.tab.closeTab(managers.tab.findIndex('joined'));
    await vi.advanceTimersByTimeAsync(REMOTE_SHUTDOWN_DRAIN_MS);
    expect(h.frames).toContainEqual({ type: 'shutdown' });
    expect(h.transports[0].connected).toBe(false);
  });

  it('retains the harness process, row, and record after local tab cleanup', async () => {
    const h = await launch();
    h.frames.length = 0;
    expect(managers.sessions.detach('claude')).toBe(true);
    await vi.advanceTimersByTimeAsync(PROVISION_FAILURE_CLOSE_DELAY_MS + 10);
    expect(managers.tab.byLabel('claude')).toBeUndefined();
    expect(managers.sessions.view()).toMatchObject([{ state: 'detached', kind: 'harness', session: SESSION }]);
    expect(saved.records).toHaveLength(1);
    expect(h.processes.states()).toHaveLength(1);
    expect(h.remoteKills).not.toHaveBeenCalled();
    expect(h.frames).toEqual([]);
  });

  it('restores the same harness through two cycles without closing the tab or losing its row', async () => {
    const h = await launch();
    const originalProcess = h.processes.states()[0];
    for (let cycle = 0; cycle < 2; cycle++) {
      expect(managers.sessions.detach('claude')).toBe(true);
      expect(managers.sessions.attach(SESSION)).toBe(true);
      await vi.advanceTimersByTimeAsync(PROVISION_FAILURE_CLOSE_DELAY_MS + 10);
      expect(managers.tab.harnessTab('claude')?.harness).toMatchObject({ status: 'running', ptyId: originalProcess.id });
      expect(managers.tab.cwdOf('claude')).toBe(WORKSPACE);
      expect(managers.sessions.view()).toMatchObject([{ state: 'active', kind: 'harness', session: SESSION }]);
      expect(saved.records).toHaveLength(1);
      expect(h.processes.states()).toEqual([originalProcess]);
    }
    expect(h.remoteSpawns).toHaveBeenCalledOnce();
    expect(h.remoteKills).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith(expect.anything(), 'remote-session-terminated', expect.anything(), expect.anything());
  });

  it('ignores an old transport exit delivered after the harness has been restored', async () => {
    const h = await launch();
    const old = h.transports[0];
    managers.sessions.detach('claude');
    managers.sessions.attach(SESSION);
    await vi.advanceTimersByTimeAsync(10);
    old.handlers.onExit(old.id, 1);
    await vi.advanceTimersByTimeAsync(PROVISION_FAILURE_CLOSE_DELAY_MS + 10);
    expect(managers.tab.harnessTab('claude')?.harness.status).toBe('running');
    expect(managers.sessions.view()).toMatchObject([{ state: 'active', session: SESSION }]);
    expect(saved.records).toHaveLength(1);
    expect(h.remoteKills).not.toHaveBeenCalled();
  });
});
