import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ptyActions } from './pty-actions';
import { useXterm } from './useXterm';

const terminal = vi.hoisted(() => ({
  write: vi.fn(), focus: vi.fn(), hasSelection: vi.fn(() => false), getSelection: vi.fn(() => ''),
  onData: vi.fn(), attachCustomKeyEventHandler: vi.fn(), loadAddon: vi.fn(), open: vi.fn(), dispose: vi.fn(),
  parser: { registerOscHandler: vi.fn(() => ({ dispose: vi.fn() })) }, cols: 80, rows: 24,
}));
vi.mock('@xterm/xterm', () => ({ Terminal: class { constructor() { return terminal; } } }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit = vi.fn(); } }));
vi.mock('./useSelectionLayer', () => ({
  useSelectionLayer: () => ({ holds: () => false, text: () => '', clear: vi.fn(), view: null, screen: null }),
}));
vi.mock('./selection', () => ({ registerTerminalSelection: vi.fn(), unregisterTerminalSelection: vi.fn() }));
vi.mock('../system-clipboard', () => ({ copyText: vi.fn() }));

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  disconnect() {}
});

describe('useXterm', () => {
  it('attaches output, forwards input and resize, reports colors, and cleans up', () => {
    const detach = vi.fn();
    let receive: ((data: string) => void) | undefined;
    let input: ((data: string) => void) | undefined;
    const send = vi.fn();
    const attachPty = vi.fn((_id: string, onData: (data: string) => void) => { receive = onData; return detach; });
    terminal.onData.mockImplementation((callback: (data: string) => void) => {
      input = callback;
      return { dispose: vi.fn() };
    });
    const container = document.createElement('div');
    const containerRef = { current: container };
    const actions = ptyActions({ send, attachPty });

    const { unmount } = renderHook(() => useXterm({ ptyId: 'p1', actions, containerRef }));
    expect(attachPty).toHaveBeenCalledWith('p1', expect.any(Function));
    receive?.('output');
    expect(terminal.write).toHaveBeenCalledWith('output');
    expect(send).toHaveBeenCalledWith({ method: 'ptyResize', params: { id: 'p1', cols: 80, rows: 24 } });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ method: 'reportTerminalColors' }));
    input?.('typed');
    expect(send).toHaveBeenCalledWith({ method: 'ptyInput', params: { id: 'p1', data: 'typed' } });
    unmount();
    expect(detach).toHaveBeenCalledOnce();
    expect(terminal.dispose).toHaveBeenCalledOnce();
  });
});
