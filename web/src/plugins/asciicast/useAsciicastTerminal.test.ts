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

// The theme's 16 ANSI slots, without the two whole-terminal colors, so a case can count them.
function ansiSlots(theme: unknown): string[] {
  const rest = { ...(theme as Record<string, string>) };
  delete rest.background;
  delete rest.foreground;
  return Object.values(rest);
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
    for (const name of ['--terminal-font-size', '--terminal-line-height', '--terminal-fg', '--terminal-bg']) {
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

  // The font size alone does not make a recording the same grid as the session that made it. Every
  // surface this app renders passes `--terminal-line-height` to the emulator, and this one silently
  // did not, so it fell to xterm's own 1: the recorded rows drew a fifth tighter than the live
  // terminal beside them, and the stage's background showed through the gap under the last row.
  it('renders at the app\'s own line height, which the emulator\'s default would get wrong', () => {
    document.documentElement.style.setProperty('--terminal-line-height', '1.4');
    render(header());
    expect(built[0].lineHeight).toBe(1.4);
  });

  it('falls back to the app default line height when none is published', () => {
    render(header());
    expect(built[0].lineHeight).toBe(1.2);
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
    // Exactly the two-key theme it has always had. A recording written before this app recorded a
    // palette carries none, and it must keep playing with xterm's own defaults for the other
    // fourteen rather than being handed a half-palette that would shift every slot after the gap.
    expect(built[0].theme).toEqual({ background: '#654321', foreground: '#123456' });

    built.length = 0;
    document.documentElement.style.setProperty('--terminal-fg', '#eeeeee');
    document.documentElement.style.setProperty('--terminal-bg', '#111111');
    render(header());
    expect(built[0].theme).toMatchObject({ background: '#111111', foreground: '#eeeeee' });
    // With nothing recorded to go on, the app's own palette stands in — sixteen slots, so a
    // recording made here and replayed under a different viewer theme still looks the same.
    expect(ansiSlots(built[0].theme)).toHaveLength(16);
  });

  it("applies the recording's own 16-colour palette when it recorded one", () => {
    const palette = Array.from({ length: 16 }, (_, index) => `#0000${String(index).padStart(2, '0')}`);
    render(header({ colors: { fg: '#123456', bg: '#654321', palette } }));
    expect(built[0].theme).toMatchObject({ background: '#654321', foreground: '#123456' });
    const theme = built[0].theme as Record<string, string>;
    // The ends of the run, because order is the whole point: a palette landing in shifted slots
    // would render every 16-colour stretch of the session wrong and nothing else would say so.
    expect(theme.black).toBe(palette[0]);
    expect(theme.white).toBe(palette[7]);
    expect(theme.brightBlack).toBe(palette[8]);
    expect(theme.brightWhite).toBe(palette[15]);
  });

  // A recording has no program behind it to interrupt, so Ctrl+C is free to mean copy — the same
  // chord it means in every other terminal. Everything that is not that chord stays with the
  // terminal, including the ones a modifier makes a different chord entirely.
  describe('the copy chord', () => {
    function keyEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
      return { type: 'keydown', key: 'c', metaKey: true, ctrlKey: true, altKey: false, shiftKey: false, ...over };
    }

    it('copies the selection and swallows the key', () => {
      const caps = capabilities();
      term.getSelection.mockReturnValue('selected text');
      const container = createRef<HTMLDivElement>();
      container.current = document.createElement('div');
      const view = renderHook(() => useAsciicastTerminal(header(), container, caps));
      const [handler] = vi.mocked(term.attachCustomKeyEventHandler).mock.calls[0] as [(event: unknown) => boolean];

      expect(handler(keyEvent())).toBe(false);
      expect(vi.mocked(caps.copyText)).toHaveBeenCalledWith('selected text');
      expect(view.result.current).toBeDefined();
    });

    it.each([
      ['a key other than c', keyEvent({ key: 'v' })],
      ['a release rather than a press', keyEvent({ type: 'keyup' })],
      ['alt held', keyEvent({ altKey: true })],
      ['shift held', keyEvent({ shiftKey: true })],
      ['neither the mac nor the pc modifier held', keyEvent({ metaKey: false, ctrlKey: false })],
    ])('leaves %s to the terminal', (_label, event) => {
      const caps = capabilities();
      term.getSelection.mockReturnValue('selected text');
      const container = createRef<HTMLDivElement>();
      container.current = document.createElement('div');
      renderHook(() => useAsciicastTerminal(header(), container, caps));
      const [handler] = vi.mocked(term.attachCustomKeyEventHandler).mock.calls[0] as [(event: unknown) => boolean];

      expect(handler(event)).toBe(true);
      expect(vi.mocked(caps.copyText)).not.toHaveBeenCalled();
    });

    it('leaves the chord alone when nothing is selected', () => {
      const caps = capabilities();
      term.getSelection.mockReturnValue('');
      const container = createRef<HTMLDivElement>();
      container.current = document.createElement('div');
      renderHook(() => useAsciicastTerminal(header(), container, caps));
      const [handler] = vi.mocked(term.attachCustomKeyEventHandler).mock.calls[0] as [(event: unknown) => boolean];

      expect(handler(keyEvent())).toBe(true);
      expect(vi.mocked(caps.copyText)).not.toHaveBeenCalled();
    });
  });

  // A terminal is a state machine: the only way to arrive at an earlier frame is to have run the
  // bytes before it. The timeline is therefore walked by index, so a seek forward costs only what it
  // skipped rather than the whole recording behind it.
  describe('renderUpTo', () => {
    const events = [
      { code: 'o' as const, time: 0, data: 'one' },
      { code: 'r' as const, time: 1, data: { cols: 100, rows: 30 } },
      { code: 'o' as const, time: 2, data: 'two' },
      { code: 'x' as const, time: 3, data: 0 },
    ];

    function mounted() {
      const { terminal } = render(header());
      return terminal;
    }

    it('writes output and applies resizes up to the time asked for', () => {
      mounted().renderUpTo(events, 2);

      expect(term.write.mock.calls).toEqual([['one'], ['two']]);
      expect(term.resize).toHaveBeenCalledWith(100, 30);
    });

    it('stops at the first event past the time asked for', () => {
      mounted().renderUpTo(events, 0.5);

      expect(term.write.mock.calls).toEqual([['one']]);
      expect(term.resize).not.toHaveBeenCalled();
    });

    it('walks forward from where it left off, replaying nothing', () => {
      const terminal = mounted();
      terminal.renderUpTo(events, 0.5);
      terminal.renderUpTo(events, 2.5);

      expect(term.write.mock.calls).toEqual([['one'], ['two']]);
      expect(term.reset).not.toHaveBeenCalled();
    });

    it('resets and replays from the start on a seek backwards', () => {
      const terminal = mounted();
      terminal.renderUpTo(events, 3);
      term.write.mockClear();
      terminal.renderUpTo(events, 0.5);

      expect(term.reset).toHaveBeenCalled();
      expect(term.write.mock.calls).toEqual([['one']]);
    });

    it('ignores an exit marker, which changes nothing on screen', () => {
      mounted().renderUpTo(events, 3);

      expect(term.write.mock.calls).toEqual([['one'], ['two']]);
    });

    // A resize recorded before the tab has been laid out has nowhere to go; the recording still plays.
    it('swallows a resize the terminal will not take', () => {
      term.resize.mockImplementationOnce(() => { throw new Error('not laid out yet'); });
      mounted().renderUpTo(events, 2);

      expect(term.write).toHaveBeenCalled();
    });

    it('does nothing when no terminal has been built', () => {
      const { terminal } = render(undefined);
      expect(() => terminal.renderUpTo(events, 3)).not.toThrow();
      expect(term.write).not.toHaveBeenCalled();
    });
  });
});