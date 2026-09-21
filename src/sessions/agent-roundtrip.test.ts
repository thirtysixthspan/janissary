import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { messageBus } from '../bus.js';
import { wireControllerEvents } from '../controller/events.js';
import { MANAGER_TAB_RELEASE, type Managers } from '../managers.js';
import { PseudoterminalManager } from '../pseudoterminal-manager.js';
import { spawnPty, type PtyHandlers } from '../pty.js';
import { startRemoteAgent } from '../profile/remote-agent.js';
import { RemoteManager } from '../remote/manager.js';
import { decodeFrame, encodeFrame, encodeHandshake, type ClientFrame, type ServerFrame } from '../remote/protocol.js';
import { RemoteProcesses } from '../remote/serve-processes.js';
import { spawnShell } from '../shell/index.js';
import { ShellManager } from '../shell/manager.js';
import { TabManager } from '../tab/manager.js';
import { TranscriptStore } from '../transcript/store.js';
import { PROVISION_FAILURE_CLOSE_DELAY_MS } from '../workspace/provision-wire.js';
import { SessionsManager } from './manager.js';
import type { RemoteSessionRecord } from './store.js';

const saved = vi.hoisted(() => ({ records: [] as RemoteSessionRecord[] }));
vi.mock(import('./store.js'), async (original) => ({
  ...await original(),
  loadRemoteSessions: () => structuredClone(saved.records),
  saveRemoteSessions: (records: RemoteSessionRecord[]) => { saved.records = structuredClone(records); },
}));
vi.mock('../pty.js', () => ({ spawnPty: vi.fn() }));
vi.mock(import('../shell/index.js'), async (original) => ({ ...await original(), spawnShell: vi.fn() }));
vi.mock('../notifications.js', () => ({ notify: vi.fn() }));
vi.mock('../file-navigator/remote-file-cache.js', () => ({ clearRemoteFileCacheForWorkspace: vi.fn() }));
vi.mock(import('../agent/state.js'), async (original) => ({ ...await original(), deleteAgentState: vi.fn() }));

const SESSION = '11111111-2222-3333-4444-555555555555';
const WORKSPACE = '/remote-only/project/.janissary/workspace/harun';
type Transport = { id: string; handlers: PtyHandlers; connected: boolean };
let managers: Managers;

function harness() {
  const transports: Transport[] = [];
  const frames: ClientFrame[] = [];
  const remoteKills = vi.fn();
  const emit = (frame: ServerFrame) => {
    const transport = transports.at(-1);
    if (transport?.connected) transport.handlers.onData(transport.id, `${encodeFrame(frame)}\n`);
  };
  const processes = new RemoteProcesses(emit, WORKSPACE, 'harun');
  vi.mocked(spawnShell).mockImplementation(() => {
    const shell = new PassThrough();
    return Object.assign(shell, {
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
      kill: () => { remoteKills(); shell.emit('exit', 0); return true; },
    }) as ReturnType<typeof spawnShell>;
  });
  vi.mocked(spawnPty).mockImplementation((program, _command, cwd, handlers) => {
    expect(cwd).toBe(process.cwd());
    const transport: Transport = { id: `ssh-${transports.length}`, handlers, connected: true };
    transports.push(transport);
    setTimeout(() => { handlers.onData(transport.id, `${encodeHandshake('/remote-only/project', SESSION)}\n`); }, 0);
    return {
      id: transport.id, program, resize: vi.fn(),
      kill: () => {
        transport.connected = false;
        setTimeout(() => { handlers.onExit(transport.id, 0); }, 0);
      },
      write: (data: string) => {
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
  managers.tab = new TabManager(managers, process.cwd());
  vi.spyOn(managers.tab, 'persist').mockImplementation(() => {});
  managers.pty = new PseudoterminalManager(managers);
  managers.remote = new RemoteManager(managers);
  managers.shell = new ShellManager(managers);
  managers.sessions = new SessionsManager(managers);
  wireControllerEvents(managers, { emitState: vi.fn(), sendPty: vi.fn(), sendPtyExit: vi.fn() });
  return { transports, frames, processes, remoteKills };
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
  managers.shell.dispose();
  managers.remote.dispose();
  managers.pty.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('restores the same agent shell through repeated detach and late transport exits', async () => {
  const h = harness();
  startRemoteAgent(managers, {
    resolved: 'harun', creator: managers.tab.cur(), address: { address: 'devbox', destination: 'devbox', host: 'devbox' },
    cwd: process.cwd(), offline: false, out: vi.fn(),
  });
  await vi.advanceTimersByTimeAsync(10);
  const original = h.processes.states();
  expect(original).toHaveLength(1);
  for (let cycle = 0; cycle < 2; cycle++) {
    const old = h.transports.at(-1)!;
    h.frames.length = 0;
    expect(managers.sessions.detach('harun')).toBe(true);
    expect(h.frames).toEqual([]);
    expect(managers.tab.byLabel('harun')).toBeUndefined();
    expect(managers.sessions.view()).toMatchObject([{ state: 'detached', session: SESSION }]);
    expect(managers.sessions.attach(SESSION)).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    old.handlers.onExit(old.id, 1);
    await vi.advanceTimersByTimeAsync(PROVISION_FAILURE_CLOSE_DELAY_MS + 10);
    expect(managers.tab.byLabel('harun')).toBeDefined();
    expect(managers.tab.byLabel('harun')?.activePty).toBeUndefined();
    expect(managers.shell.has('harun')).toBe(true);
    expect(managers.tab.cwdOf('harun')).toBe(WORKSPACE);
    expect(managers.sessions.view()).toMatchObject([{ state: 'active', kind: 'agent', session: SESSION }]);
    expect(saved.records).toHaveLength(1);
    expect(h.processes.states()).toEqual(original);
  }
  expect(spawnShell).toHaveBeenCalledOnce();
  expect(h.remoteKills).not.toHaveBeenCalled();
});
