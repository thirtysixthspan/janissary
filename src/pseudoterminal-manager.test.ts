import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnPty } from './pty.js';
import { PseudoterminalManager } from './pseudoterminal-manager.js';
import { makeTab } from './tab.js';
import type { Managers } from './managers.js';
import type { Tab } from './types.js';

// Mock spawnPty so tests never spawn a real process (mirrors controller.test.ts).
vi.mock('./pty.js');

function makeManagers(tabs: Tab[]): { managers: Managers; persist: ReturnType<typeof vi.fn> } {
  const persist = vi.fn();
  const managers = {
    tab: {
      tabs,
      cwdOf: vi.fn(() => '/repo'),
      persist,
      buildAgentState: vi.fn((tab: Tab) => ({ name: tab.label, dotColor: tab.dotColor, active: true })),
    },
  } as unknown as Managers;
  return { managers, persist };
}

describe('PseudoterminalManager', () => {
  let capturedHandlers: { onData: (id: string, data: string) => void; onExit: (id: string, exitCode: number) => void } | null;
  let write: ReturnType<typeof vi.fn>;
  let resize: ReturnType<typeof vi.fn>;
  let kill: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    capturedHandlers = null;
    write = vi.fn();
    resize = vi.fn();
    kill = vi.fn();
    vi.mocked(spawnPty).mockReset();
    vi.mocked(spawnPty).mockImplementation((program, _command, _cwd, handlers) => {
      capturedHandlers = handlers;
      return { id: 'pty1', program, write, resize, kill };
    });
  });

  it('spawn registers the session and returns its id', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    const manager = new PseudoterminalManager(managers);

    const id = manager.spawn('main', 'vim', 'vim file.txt', '/repo');

    expect(id).toBe('pty1');
    expect(manager.terminalsFor('main')).toEqual(['vim']);
    expect(vi.mocked(spawnPty)).toHaveBeenCalledWith(
      'vim', 'vim file.txt', '/repo', expect.anything(), 80, 24, expect.anything(),
    );
  });

  it('resize changes the dimensions used for subsequently spawned PTYs', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    const manager = new PseudoterminalManager(managers);

    manager.resize(120, 40);
    manager.spawn('main', 'vim', 'vim file.txt', '/repo');

    expect(vi.mocked(spawnPty)).toHaveBeenCalledWith(
      'vim', 'vim file.txt', '/repo', expect.anything(), 120, 40, expect.anything(),
    );
  });

  it('input forwards keystrokes to the matching PTY', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    const manager = new PseudoterminalManager(managers);
    const id = manager.spawn('main', 'vim', 'vim file.txt', '/repo');

    manager.input(id, 'hello');

    expect(write).toHaveBeenCalledWith('hello');
  });

  it('input on an unknown id is a no-op', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    const manager = new PseudoterminalManager(managers);
    expect(() => manager.input('ghost', 'x')).not.toThrow();
  });

  it('resizeOne resizes the matching PTY', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    const manager = new PseudoterminalManager(managers);
    const id = manager.spawn('main', 'vim', 'vim file.txt', '/repo');

    manager.resizeOne(id, 100, 30);

    expect(resize).toHaveBeenCalledWith(100, 30);
  });

  it('kill kills the matching PTY', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    const manager = new PseudoterminalManager(managers);
    const id = manager.spawn('main', 'vim', 'vim file.txt', '/repo');

    manager.kill(id);

    expect(kill).toHaveBeenCalledTimes(1);
  });

  it('terminalsFor lists program names owned by a tab, empty for one with none', () => {
    const { managers } = makeManagers([makeTab('main', 'red'), makeTab('other', 'blue')]);
    const manager = new PseudoterminalManager(managers);
    manager.spawn('main', 'vim', 'vim file.txt', '/repo');

    expect(manager.terminalsFor('main')).toEqual(['vim']);
    expect(manager.terminalsFor('other')).toEqual([]);
  });

  it('openInlinePty spawns a PTY, sets activePty on the tab, and falls back to process.cwd()', () => {
    const tab = makeTab('main', 'red');
    const { managers } = makeManagers([tab]);
    vi.mocked(managers.tab.cwdOf).mockReturnValue(undefined);
    const manager = new PseudoterminalManager(managers);

    manager.openInlinePty('main', 'less file.txt', 'less');

    expect(vi.mocked(spawnPty)).toHaveBeenCalledWith(
      'less', 'less file.txt', process.cwd(), expect.anything(), 80, 24, expect.anything(),
    );
    expect(tab.activePty).toBe('pty1');
  });

  it('closeTab kills and forgets only the PTYs owned by that tab', () => {
    const { managers } = makeManagers([makeTab('main', 'red'), makeTab('other', 'blue')]);
    const manager = new PseudoterminalManager(managers);
    manager.spawn('main', 'vim', 'vim file.txt', '/repo');
    const otherKill = vi.fn();
    vi.mocked(spawnPty).mockImplementationOnce((program, _c, _cwd, handlers) => {
      capturedHandlers = handlers;
      return { id: 'pty2', program, write: vi.fn(), resize: vi.fn(), kill: otherKill };
    });
    manager.spawn('other', 'top', 'top', '/repo');

    manager.closeTab('main');

    expect(kill).toHaveBeenCalledTimes(1);
    expect(otherKill).not.toHaveBeenCalled();
    expect(manager.terminalsFor('main')).toEqual([]);
    expect(manager.terminalsFor('other')).toEqual(['top']);
  });

  it('closeAll kills every PTY and clears the registry', () => {
    const { managers } = makeManagers([makeTab('main', 'red')]);
    const manager = new PseudoterminalManager(managers);
    manager.spawn('main', 'vim', 'vim file.txt', '/repo');

    manager.closeAll();

    expect(kill).toHaveBeenCalledTimes(1);
    expect(manager.terminalsFor('main')).toEqual([]);
  });

  it('handleExit (via onExit) clears activePty on full-tab takeovers', () => {
    const tab = makeTab('main', 'red');
    const { managers } = makeManagers([tab]);
    const manager = new PseudoterminalManager(managers);
    const id = manager.spawn('main', 'vim', 'vim file.txt', '/repo');
    tab.activePty = id;

    capturedHandlers!.onExit(id, 0);

    expect(tab.activePty).toBeUndefined();
    expect(manager.terminalsFor('main')).toEqual([]);
  });

  it('handleExit updates an inline terminal card log entry and persists it', () => {
    const tab = makeTab('main', 'red');
    const { managers, persist } = makeManagers([tab]);
    const manager = new PseudoterminalManager(managers);
    const id = manager.spawn('main', 'vim', 'vim file.txt', '/repo');
    tab.log = [{ input: 'vim file.txt', output: '', terminal: { ptyId: id, program: 'vim', status: 'running' } }];

    capturedHandlers!.onExit(id, 1);

    expect(tab.log[0].terminal).toEqual({ ptyId: id, program: 'vim', status: 'exited', exitCode: 1 });
    expect(persist).toHaveBeenCalled();
  });

  it('handleExit on an already-removed PTY does not touch tab logs', () => {
    const tab = makeTab('main', 'red');
    const { managers, persist } = makeManagers([tab]);
    const manager = new PseudoterminalManager(managers);
    const id = manager.spawn('main', 'vim', 'vim file.txt', '/repo');
    manager.kill(id);
    manager.closeTab('main');
    tab.log = [{ input: 'vim file.txt', output: '', terminal: { ptyId: id, program: 'vim', status: 'running' } }];
    persist.mockClear();

    capturedHandlers!.onExit(id, 0);

    expect(tab.log[0].terminal?.status).toBe('running');
    expect(persist).not.toHaveBeenCalled();
  });
});
