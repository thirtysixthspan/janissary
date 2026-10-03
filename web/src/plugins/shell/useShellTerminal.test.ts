import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PluginTerminal } from '../api';
import { useShellTerminal } from './useShellTerminal';

const terminals: { written: string[]; disposed: boolean; options: Record<string, unknown> }[] = [];
const fitCalls: number[] = [];

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
});

function harness(overrides: { attachTerminal?: undefined } = {}) {
  const written: string[] = [];
  const resized: { cols: number; rows: number }[] = [];
  const exitHandlers: (() => void)[] = [];
  const detached: number[] = [];
  // The callbacks the hook was handed, so a test can push bytes through the channel it actually used
  // rather than reaching past the attachment into the terminal.
  const byteCallbacks: ((data: string) => void)[] = [];
  const handle: PluginTerminal = {
    write: (data) => { written.push(data); },
    resize: (cols, rows) => { resized.push({ cols, rows }); },
    onExit: (handler) => { exitHandlers.push(handler); },
    detach: () => { detached.push(1); },
  };
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

  it('refuses a terminal that would take keystrokes', () => {
    harness();

    // Nothing may be typed into this terminal directly: the command line is the only input path, and
    // this is what makes that structural rather than a matter of where focus happens to be.
    expect(terminals[0].options.disableStdin).toBe(true);
    expect(terminals[0].options.cursorBlink).toBe(false);
  });
});