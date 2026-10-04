import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PluginTerminal } from '../api';
import { useShellTerminal } from './useShellTerminal';

const terminals: { written: string[]; disposed: boolean; options: Record<string, unknown> }[] = [];
const fitCalls: number[] = [];
const terminalDataHandlers: ((data: string) => void)[] = [];
const terminalFocusCalls: number[] = [];

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    written: string[] = [];
    disposed = false;
    options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      terminals.push(this as unknown as { written: string[]; disposed: boolean; options: Record<string, unknown> });
    }

    loadAddon() {}
    open() {}
    dispose() { this.disposed = true; }
    write(data: string) { this.written.push(data); }
    hasSelection() { return false; }
    getSelection() { return ''; }
    clearSelection() {}
    onData(handler: (data: string) => void) { terminalDataHandlers.push(handler); }
    focus() { terminalFocusCalls.push(1); }
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

function harness(overrides: { attachTerminal?: undefined } = {}) {
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
  const container = document.createElement('div');
  const containerRef = { current: container };
  const view = renderHook(() => useShellTerminal({
    ptyId: 'pty7', containerRef, attachTerminal, onExit,
  }));
  return { byteCallbacks, container, exitHandlers, handle, onExit, resized, detached, written, ...view };
}

describe('useShellTerminal', () => {
  it('renders the bytes the attachment hands it', () => {
    const { byteCallbacks } = harness();

    byteCallbacks[0]?.('hello from zsh');

    expect(terminals[0].written).toEqual(['hello from zsh']);
  });

  it('reports its fitted size to the process once it is attached', () => {
    const { resized } = harness();

    expect(resized).toEqual([{ cols: 120, rows: 40 }]);
  });

  it('writes what the tab sends through its handle', () => {
    const { result, written } = harness();

    act(() => { result.current.write('ls -la\n'); });

    expect(written).toEqual(['ls -la\n']);
  });

  it('forwards keystrokes from the focused terminal through its attached handle', () => {
    const { written } = harness();

    act(() => { terminalDataHandlers[0]?.('ls\n'); });

    expect(written).toEqual(['ls\n']);
  });

  it('focuses the terminal on request', () => {
    const { result } = harness();

    act(() => { result.current.focus(); });

    expect(terminalFocusCalls).toEqual([1]);
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
      onExit: vi.fn(),
    }));

    expect(terminals).toHaveLength(0);
    expect(() => { result.current.write('x'); }).not.toThrow();
  });

  it('accepts keystrokes when focused and shows a terminal cursor', () => {
    harness();

    expect(terminals[0].options.disableStdin).toBe(false);
    expect(terminals[0].options.cursorBlink).toBe(true);
  });

  it('survives a tab switch, which hands it a fresh capability object', () => {
    const container = document.createElement('div');
    const containerRef = { current: container };
    const first = vi.fn((_id: string, _onData: (data: string) => void) => makeHandle());
    const { rerender, unmount } = renderHook(
      ({ attachTerminal }) => useShellTerminal({
        ptyId: 'pty7', containerRef, attachTerminal, onExit: vi.fn(),
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
});
