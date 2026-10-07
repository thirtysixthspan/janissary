import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PluginTerminal } from '../api';
import { useShellTerminal } from './useShellTerminal';

const terminals: { written: string[]; disposed: boolean; options: Record<string, unknown>; clearCalls: number }[] = [];
const fitCalls: number[] = [];
const terminalDataHandlers: ((data: string) => void)[] = [];
const terminalFocusCalls: number[] = [];
const oscHandlers: { id: number; handle: (data: string) => boolean }[] = [];
const terminalKeyHandlers: ((event: KeyboardEvent) => boolean)[] = [];
let terminalSelection = '';

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    written: string[] = [];
    disposed = false;
    clearCalls = 0;
    options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      terminals.push(this as unknown as { written: string[]; disposed: boolean; options: Record<string, unknown>; clearCalls: number });
    }

    loadAddon() {}
    open() {}
    dispose() { this.disposed = true; }
    write(data: string) { this.written.push(data); }
    hasSelection() { return Boolean(terminalSelection); }
    getSelection() { return terminalSelection; }
    clearSelection() {}
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) { terminalKeyHandlers.push(handler); }
    clear() { this.clearCalls += 1; }
    textarea = undefined;
    buffer = { active: { baseY: 0, cursorY: 0, type: 'normal' } };
    onCursorMove() { return { dispose: () => {} }; }
    registerMarker() { return { line: 0, dispose: () => {} }; }
    registerDecoration() {}
    onData(handler: (data: string) => void) { terminalDataHandlers.push(handler); }
    focus() { terminalFocusCalls.push(1); }
    parser = { registerOscHandler: (id: number, handler: (data: string) => boolean) => { oscHandlers.push({ id, handle: handler }); return { dispose() {} }; } };
    get cols() { return 120; }
    get rows() { return 40; }
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() { fitCalls.push(1); }
    activate() {}
    dispose() {}
  },
}));

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

beforeEach(() => {
  terminals.length = 0;
  fitCalls.length = 0;
  terminalDataHandlers.length = 0;
  terminalFocusCalls.length = 0;
  oscHandlers.length = 0;
  terminalKeyHandlers.length = 0;
  terminalSelection = '';
});

function makeHandle(into: {
  written?: string[]; resized?: { cols: number; rows: number }[];
  exitHandlers?: (() => void)[]; detached?: number[];
} = {}): PluginTerminal {
  return {
    write: (data) => { into.written?.push(data); },
    resize: (cols, rows) => { into.resized?.push({ cols, rows }); },
    onExit: (handler) => { into.exitHandlers?.push(handler); },
    detach: () => { into.detached?.push(1); },
  };
}

// The nonce the server minted with the shell and zsh's startup files installed the hooks with.
const NONCE = 'a'.repeat(32);

function harness(overrides: {
  attachTerminal?: undefined;
  reportColors?: (id: string, colors: { fg: string; bg: string; palette?: readonly string[] }) => void;
} = {}) {
  const written: string[] = [];
  const resized: { cols: number; rows: number }[] = [];
  const exitHandlers: (() => void)[] = [];
  const detached: number[] = [];
  // The callbacks the hook was handed, so a test can push bytes through the channel it actually used
  // rather than reaching past the attachment into the terminal.
  const byteCallbacks: ((data: string) => void)[] = [];
  const handle = makeHandle({ written, resized, exitHandlers, detached });
  const attachTerminal = overrides.attachTerminal
    ? undefined
    : vi.fn((_id: string, onData: (data: string) => void) => {
      byteCallbacks.push(onData);
      return handle;
    });
  const onExit = vi.fn();
  const onCommandRunning = vi.fn();
  const onCwd = vi.fn();
  const copyText = vi.fn();
  const reportColors = overrides.reportColors ?? vi.fn();
  const container = document.createElement('div');
  const containerRef = { current: container };
  const view = renderHook(() => useShellTerminal({
    ptyId: 'pty7', containerRef, attachTerminal, onExit, onCommandRunning, onCwd,
    copyText, reportColors, hookNonce: NONCE,
  }));
  return {
    byteCallbacks, container, copyText, exitHandlers, handle, onExit, onCommandRunning, onCwd,
    reportColors, resized,
    detached, written, ...view,
  };
}

function osc(id: number): (data: string) => boolean {
  const handler = oscHandlers.find((entry) => entry.id === id);
  if (!handler) throw new Error(`no OSC ${String(id)} handler registered`);
  return handler.handle;
}

describe('useShellTerminal', () => {
  it('attaches to the SSH PTY while provisioning, then switches to the remote shell PTY', () => {
    const attached: string[] = [];
    const exitHandlers: (() => void)[] = [];
    const detached: number[] = [];
    const attachTerminal = vi.fn((id: string) => {
      attached.push(id);
      return makeHandle({ exitHandlers, detached });
    });
    const reportColors = vi.fn();
    const containerRef = { current: document.createElement('div') };
    const props = {
      ptyId: undefined as string | undefined, connectPtyId: 'ssh-pty' as string | undefined,
    };
    const view = renderHook((current) => useShellTerminal({
      ...current, containerRef, attachTerminal, reportColors, onExit: vi.fn(),
      onCommandRunning: vi.fn(), onCwd: vi.fn(), copyText: vi.fn(), hookNonce: NONCE,
    }), { initialProps: props });

    expect(attached).toEqual(['ssh-pty']);
    expect(reportColors).not.toHaveBeenCalled();
    expect(oscHandlers).toHaveLength(0);
    expect(terminals[0]?.options.disableStdin).toBe(false);

    view.rerender({ ptyId: 'remote-pty', connectPtyId: undefined });

    expect(attached).toEqual(['ssh-pty', 'remote-pty']);
    expect(reportColors).toHaveBeenCalledWith('remote-pty', expect.any(Object));
    expect(oscHandlers.length).toBeGreaterThan(0);
    expect(detached).toEqual([1]);
  });

  it('renders the bytes the attachment hands it', () => {
    const { byteCallbacks } = harness();

    byteCallbacks[0]?.('hello from zsh');

    expect(terminals[0].written).toEqual(['hello from zsh']);
  });

  it('enables xterm proposed APIs for inline markdown decorations', () => {
    harness();

    expect(terminals[0].options).toMatchObject({ allowProposedApi: true });
  });

  it('reports its fitted size to the process once it is attached', () => {
    const { resized } = harness();

    expect(resized).toEqual([{ cols: 120, rows: 40 }]);
  });

  it('writes what the tab sends through its handle', () => {
    const { result, written } = harness();

    act(() => { result.current.write('ls -la\n'); });

    expect(written.at(-1)).toBe('ls -la\n');
  });

  it('forwards keystrokes from the focused terminal through its attached handle', () => {
    const { written } = harness();

    act(() => { terminalDataHandlers[0]?.('ls\n'); });

    expect(written.at(-1)).toBe('ls\n');
  });

  it('copies a terminal selection through the shared clipboard capability', () => {
    const { copyText } = harness();
    terminalSelection = 'selected terminal text';

    const handled = terminalKeyHandlers[0]?.(new KeyboardEvent('keydown', {
      key: 'c', ctrlKey: true, shiftKey: true,
    }));

    expect(handled).toBe(false);
    expect(copyText).toHaveBeenCalledWith('selected terminal text');
  });

  it('leaves the copy chord for the shell when the terminal has no selection', () => {
    const { copyText } = harness();

    const handled = terminalKeyHandlers[0]?.(new KeyboardEvent('keydown', {
      key: 'c', ctrlKey: true, shiftKey: true,
    }));

    expect(handled).toBe(true);
    expect(copyText).not.toHaveBeenCalled();
  });

  it('falls back to an ANSI reply when the terminal has no screen to place a rendered block on', () => {
    const { result } = harness();

    act(() => { result.current.displayReply('help', '**bold** reply'); });

    expect(terminals[0].written.at(-1)).toBe('\r\u{1B}[2K\u{1B}[1m> help\u{1B}[22m\r\n\u{1B}[1mbold\u{1B}[22m reply\r\n\u{1B}[1m>\u{1B}[22m ');
  });

  it('writes a fallback reply without the control sequences its text carried', () => {
    const { result } = harness();

    act(() => { result.current.displayReply('help\u{1B}[6n', 'moved\u{1B}]7;file:///tmp\u{7} here\u{1B}[6n'); });

    expect(terminals[0].written.at(-1)).toBe('\r\u{1B}[2K\u{1B}[1m> help\u{1B}[22m\r\nmoved here\r\n\u{1B}[1m>\u{1B}[22m ');
  });

  it('focuses the terminal on request', () => {
    const { result } = harness();

    act(() => { result.current.focus(); });

    expect(terminalFocusCalls).toEqual([1]);
  });

  it('reports command start and prompt markers signed with the payload\'s nonce', () => {
    const { onCommandRunning } = harness();

    expect(osc(133)(`C;${NONCE}`)).toBe(true);
    expect(osc(133)(`D;${NONCE}`)).toBe(true);

    expect(onCommandRunning.mock.calls).toEqual([[true], [false]]);
  });

  it('ignores status markers that do not carry the nonce its hooks were installed with', () => {
    const onCommand = vi.fn();
    const onCommandRunning = vi.fn();
    const onCwd = vi.fn();
    renderHook(() => useShellTerminal({
      ptyId: 'pty7', containerRef: { current: document.createElement('div') },
      attachTerminal: () => makeHandle(),
      onExit: vi.fn(), onCommandRunning, onCwd, onCommand, copyText: vi.fn(),
      hookNonce: NONCE,
    }));
    const forged = 'f'.repeat(32);

    for (const marker of ['C', `C;${btoa('rm -rf ~')}`, `C;${forged};${btoa('rm -rf ~')}`, 'D', `D;${forged}`]) {
      expect(osc(133)(marker)).toBe(true);
    }
    expect(osc(7)('file://localhost/etc')).toBe(true);
    expect(osc(7)(`${forged};${btoa('/etc')}`)).toBe(true);

    expect(onCommandRunning).not.toHaveBeenCalled();
    expect(onCommand).not.toHaveBeenCalled();
    expect(onCwd).not.toHaveBeenCalled();

    osc(133)(`C;${NONCE};${btoa('ls')}`);
    osc(133)(`D;${NONCE}`);
    osc(7)(`${NONCE};${btoa('/work')}`);

    expect(onCommandRunning.mock.calls).toEqual([[true], [false]]);
    expect(onCommand.mock.calls).toEqual([['ls']]);
    expect(onCwd.mock.calls).toEqual([['/work']]);
  });

  it('types nothing into the shell and hides nothing, however often it mounts', () => {
    const first = harness();
    first.unmount();
    const second = harness();

    for (const mount of [first, second]) {
      expect(mount.written).toEqual([]);
      expect(mount.container.className).toBe('');
    }
    expect(second.resized).toEqual([{ cols: 120, rows: 40 }]);
  });

  it('clears what the startup files printed once zsh marks its setup complete', () => {
    const { byteCallbacks } = harness();

    byteCallbacks[0]?.('zsh: locking failed for ~/.zsh_history\r\n');
    expect(osc(133)(`E;${'f'.repeat(32)}`)).toBe(true);
    expect(terminals[0].clearCalls).toBe(0);
    expect(osc(133)(`E;${NONCE}`)).toBe(true);

    expect(terminals[0].clearCalls).toBe(1);
  });

  it('reports the command line a start marker carries as well as the running state', () => {
    const onCommand = vi.fn();
    const onCommandRunning = vi.fn();
    renderHook(() => useShellTerminal({
      ptyId: 'pty7', containerRef: { current: document.createElement('div') },
      attachTerminal: () => makeHandle(),
      onExit: vi.fn(), onCommandRunning, onCwd: vi.fn(), onCommand, copyText: vi.fn(),
      hookNonce: NONCE,
    }));

    expect(osc(133)(`C;${NONCE};${btoa('git status')}`)).toBe(true);

    expect(onCommandRunning.mock.calls).toEqual([[true]]);
    expect(onCommand.mock.calls).toEqual([['git status']]);
  });

  it('reports the path from zsh current-directory markers', () => {
    const { onCwd } = harness();

    expect(osc(7)(`${NONCE};${btoa('/work/child dir')}`)).toBe(true);
    expect(onCwd).toHaveBeenCalledWith('/work/child dir');
  });

  it('reports an exit to the tab', () => {
    const { exitHandlers, onExit } = harness();

    for (const handler of exitHandlers) handler();

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('detaches and disposes on teardown', () => {
    const { detached, unmount } = harness();

    unmount();

    expect(detached).toEqual([1]);
    expect(terminals[0].disposed).toBe(true);
  });

  it('opens nothing at all when the host gave it no way to reach a terminal', () => {
    const container = document.createElement('div');
    const { result } = renderHook(() => useShellTerminal({
      ptyId: 'pty7',
      containerRef: { current: container },
      attachTerminal: undefined,
      onExit: vi.fn(), onCommandRunning: vi.fn(), copyText: vi.fn(), hookNonce: NONCE,
      onCwd: vi.fn(),
    }));

    expect(terminals).toHaveLength(0);
    expect(() => { result.current.write('x'); }).not.toThrow();
  });

  it('accepts keystrokes when focused and shows a terminal cursor', () => {
    harness();

    expect(terminals[0].options.disableStdin).toBe(false);
    expect(terminals[0].options.cursorBlink).toBe(true);
  });

  it('draws no cursor while the terminal does not hold the keyboard', () => {
    harness();

    expect(terminals[0].options.cursorInactiveStyle).toBe('none');
  });

  it('refreshes xterm colors when the application theme changes', async () => {
    const root = document.documentElement;
    const previous = {
      foreground: root.style.getPropertyValue('--fg'),
      background: root.style.getPropertyValue('--bg'),
      theme: root.dataset.theme,
    };
    root.style.setProperty('--fg', '#111111');
    root.style.setProperty('--bg', '#222222');
    const { unmount } = harness();

    expect(terminals[0]?.options.theme).toMatchObject({ foreground: '#111111', background: '#222222' });

    root.style.setProperty('--fg', '#aaaaaa');
    root.style.setProperty('--bg', '#bbbbbb');
    root.dataset.theme = 'nord';
    await waitFor(() => {
      expect(terminals[0]?.options.theme).toMatchObject({ foreground: '#aaaaaa', background: '#bbbbbb' });
    });
    const updatedTheme = terminals[0]?.options.theme;

    unmount();
    root.dataset.theme = 'dark';
    await Promise.resolve();
    expect(terminals[0]?.options.theme).toBe(updatedTheme);

    if (previous.foreground) root.style.setProperty('--fg', previous.foreground);
    else root.style.removeProperty('--fg');
    if (previous.background) root.style.setProperty('--bg', previous.background);
    else root.style.removeProperty('--bg');
    if (previous.theme === undefined) delete root.dataset.theme;
    else root.dataset.theme = previous.theme;
  });

  it('survives a tab switch, which hands it a fresh capability object', () => {
    const container = document.createElement('div');
    const containerRef = { current: container };
    const first = vi.fn((_id: string, _onData: (data: string) => void) => makeHandle());
    const { rerender, unmount } = renderHook(
      ({ attachTerminal }) => useShellTerminal({
        ptyId: 'pty7', containerRef, attachTerminal, onExit: vi.fn(), onCommandRunning: vi.fn(), onCwd: vi.fn(), copyText: vi.fn(),
        hookNonce: NONCE,
      }),
      { initialProps: { attachTerminal: first } },
    );

    // The host rebuilds the capability object whenever the tab becomes visible or hidden, so the
    // function identity changes on every tab switch even though nothing about the terminal has.
    const second = vi.fn((_id: string, _onData: (data: string) => void) => makeHandle());
    rerender({ attachTerminal: second });

    expect(terminals).toHaveLength(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(terminals[0].disposed).toBe(false);

    unmount();
    expect(terminals[0].disposed).toBe(true);
  });

  // The host cannot work these colors out for itself — they live only in the web stylesheet — and the
  // recording header is written on the tab's first output, so a report that arrives after it would be
  // reporting into a file that already exists.
  it('reports the resolved colors once for its PTY after mount, so the recording carries them', () => {
    const { reportColors } = harness();

    expect(reportColors).toHaveBeenCalledTimes(1);
    const [id, colors] = vi.mocked(reportColors).mock.calls[0]!;
    expect(id).toBe('pty7');
    expect(colors.fg).toMatch(/^#[0-9a-f]{6}$/iu);
    expect(colors.bg).toMatch(/^#[0-9a-f]{6}$/iu);
    // All sixteen, in ANSI order — a palette of a different length is refused by the server, which
    // would leave every recording this tab makes without one.
    expect(colors.palette).toHaveLength(16);
    expect(colors.palette?.[0]).toMatch(/^#[0-9a-f]{6}$/iu);
    expect(new Set(colors.palette).size).toBe(16);
  });

  it('does not report again when the terminal re-renders', () => {
    const { reportColors, rerender } = harness();

    rerender();

    // Read at mount and not watched: a theme change afterwards must not rewrite the colors a session
    // that has already started was recorded under.
    expect(reportColors).toHaveBeenCalledTimes(1);
  });
});
