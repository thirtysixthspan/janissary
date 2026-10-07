import { renderHook, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { PluginTerminal } from '../api';
import { useShellTerminal } from './useShellTerminal';

// The stub opens the way xterm.js does where it matters here: its element holds a hidden textarea that
// is the terminal's keyboard surface, and an always-on mousedown listener on that element focuses it
// before any click handler of the tab's own can run.
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    element: HTMLElement | undefined;
    textarea: HTMLTextAreaElement | undefined;
    buffer = { active: { baseY: 0, cursorY: 0, type: 'normal' } };
    parser = { registerOscHandler: () => ({ dispose() {} }) };
    options: Record<string, unknown> = {};

    open(parent: HTMLElement) {
      const element = document.createElement('div');
      element.className = 'xterm';
      const screen = document.createElement('div');
      screen.className = 'xterm-screen';
      const textarea = document.createElement('textarea');
      textarea.className = 'xterm-helper-textarea';
      element.append(textarea, screen);
      element.addEventListener('mousedown', (event) => {
        event.preventDefault();
        this.focus();
      });
      parent.append(element);
      this.element = element;
      this.textarea = textarea;
    }

    focus() { this.textarea?.focus({ preventScroll: true }); }
    loadAddon() {}
    dispose() { this.element?.remove(); }
    write() {}
    hasSelection() { return false; }
    getSelection() { return ''; }
    clearSelection() {}
    attachCustomKeyEventHandler() {}
    onCursorMove() { return { dispose: () => {} }; }
    registerMarker() { return { line: 0, dispose: () => {} }; }
    registerDecoration() {}
    onData() {}
    get cols() { return 120; }
    get rows() { return 40; }
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class { fit() {} activate() {} dispose() {} },
}));

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

const handle: PluginTerminal = { write: () => {}, resize: () => {}, onExit: () => {}, detach: () => {} };

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function mountTerminal() {
  const bar = document.createElement('textarea');
  const container = document.createElement('div');
  document.body.append(container, bar);
  const containerRef = { current: container };
  const view = renderHook(() => useShellTerminal({
    ptyId: 'pty7', containerRef, attachTerminal: () => handle, onExit: vi.fn(), onCommandRunning: vi.fn(),
    onCwd: vi.fn(), copyText: vi.fn(), hookNonce: 'b'.repeat(32),
  }));
  const textarea = container.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')!;
  const screen = container.querySelector<HTMLElement>('.xterm-screen')!;
  const terminalFocuses: number[] = [];
  textarea.addEventListener('focus', () => { terminalFocuses.push(1); });
  bar.focus();
  return { bar, screen, textarea, terminalFocuses, ...view };
}

describe('useShellTerminal press focus', () => {
  it('never focuses the terminal on a single press, so the command bar keeps the keyboard', () => {
    const { bar, screen, terminalFocuses } = mountTerminal();

    fireEvent.mouseDown(screen, { button: 0, detail: 1 });
    expect(document.activeElement).toBe(bar);
    fireEvent.mouseUp(screen, { button: 0, detail: 1 });
    fireEvent.click(screen, { button: 0, detail: 1 });

    expect(terminalFocuses).toEqual([]);
    expect(document.activeElement).toBe(bar);
  });

  // Input events can arrive back to back with no task between them, as a fast double-click does.
  it('lets the second press of a double-click focus the terminal, however quickly it follows', () => {
    const { screen, textarea } = mountTerminal();

    fireEvent.mouseDown(screen, { button: 0, detail: 1 });
    fireEvent.mouseUp(screen, { button: 0, detail: 1 });
    fireEvent.click(screen, { button: 0, detail: 1 });
    fireEvent.mouseDown(screen, { button: 0, detail: 2 });

    expect(document.activeElement).toBe(textarea);
  });

  it('leaves the terminal focusable as soon as the single press is over', () => {
    const { result, screen, textarea } = mountTerminal();

    fireEvent.mouseDown(screen, { button: 0, detail: 1 });
    result.current.focus();

    expect(document.activeElement).toBe(textarea);
  });

  it('releases a press stopped before it reached the terminal on the next task', async () => {
    const { result, screen, textarea } = mountTerminal();
    screen.addEventListener('mousedown', (event) => { event.stopPropagation(); }, { once: true });

    fireEvent.mouseDown(screen, { button: 0, detail: 1 });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    result.current.focus();

    expect(document.activeElement).toBe(textarea);
  });
});
