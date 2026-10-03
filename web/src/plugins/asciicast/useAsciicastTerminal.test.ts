import { createRef } from 'react';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CastHeader } from './cast-stream';
import { useAsciicastTerminal, type AsciicastTerminal } from './useAsciicastTerminal';

// xterm needs canvas and real metrics, so it is faked the way `HarnessTab.test.tsx` fakes it: the
// constructor is a spy, and the cases here are about the options it was handed and about what the hook
// does afterwards. That second half is the point — a font that is scaled to fit the pane was set by a
// resize observer, so "nothing observes the container" is what pins the size the recording gets.
vi.mock('@xterm/xterm', () => ({ Terminal: vi.fn() }));

const built: Record<string, unknown>[] = [];
const observers: number[] = [];

vi.stubGlobal('ResizeObserver', class {
  constructor() { observers.push(observers.length); }
  observe() {}
  unobserve() {}
  disconnect() {}
});

function fakeTerminal() {
  return {
    open: vi.fn(),
    write: vi.fn(),
    reset: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    getSelection: vi.fn(() => ''),
    options: {} as { fontSize?: number },
    attachCustomKeyEventHandler: vi.fn(),
  };
}

const header = (overrides: Partial<CastHeader> = {}): CastHeader => ({
  version: 3, cols: 120, rows: 40, command: 'claude', title: 'claude', timestamp: 0, ...overrides,
});

function capabilities() {
  return { copyText: vi.fn() } as unknown as Parameters<typeof useAsciicastTerminal>[2];
}

function render(headerValue: CastHeader | undefined) {
  const container = createRef<HTMLDivElement>();
  container.current = document.createElement('div');
  const view = renderHook(() => useAsciicastTerminal(headerValue, container, capabilities()));
  return { view, terminal: view.result.current as AsciicastTerminal & { options: { fontSize?: number } } };
}

describe('useAsciicastTerminal', () => {
  let term: ReturnType<typeof fakeTerminal>;

  beforeEach(async () => {
    built.length = 0;
    observers.length = 0;
    const { Terminal: TerminalMock } = await import('@xterm/xterm');
    term = fakeTerminal();
    vi.mocked(TerminalMock).mockImplementation(function (...args: unknown[]) {
      built.push((args[0] ?? {}) as Record<string, unknown>);
      return term as never;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // The styles are read off the real document element, so each case's custom properties are
    // cleared rather than left for the next one.
    for (const name of ['--terminal-font-size', '--terminal-fg', '--terminal-bg']) {
      document.documentElement.style.removeProperty(name);
    }
  });

  it('builds the terminal at the recording\'s own columns and rows', () => {
    render(header());
    expect(built).toHaveLength(1);
    expect(built[0].cols).toBe(120);
    expect(built[0].rows).toBe(40);
  });

  it('renders at the app\'s own terminal font size rather than one scaled to the pane', () => {
    document.documentElement.style.setProperty('--terminal-font-size', '16px');
    render(header());
    expect(built[0].fontSize).toBe(16);
  });

  it('falls back to the app default when the font size is not published', () => {
    render(header());
    expect(built[0].fontSize).toBe(13.5);
  });

  it('never resizes the terminal once it is built, so nothing shrinks it to fit', () => {
    render(header());
    // A scaled font was driven by observing the container and rewriting the option on every pane
    // resize. Nothing observes the container now, so the size the recording was built at is the size
    // it keeps, in a narrow sidebar and a wide centre tab alike.
    expect(observers).toHaveLength(0);
    expect(term.options.fontSize).toBeUndefined();
  });

  it('themes the terminal from the recording, and from the app when it recorded none', () => {
    render(header({ colors: { fg: '#123456', bg: '#654321' } }));
    expect(built[0].theme).toEqual({ background: '#654321', foreground: '#123456' });

    built.length = 0;
    document.documentElement.style.setProperty('--terminal-fg', '#eeeeee');
    document.documentElement.style.setProperty('--terminal-bg', '#111111');
    render(header());
    expect(built[0].theme).toEqual({ background: '#111111', foreground: '#eeeeee' });
  });
});