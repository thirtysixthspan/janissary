import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppTerminal } from './app-terminal';

// xterm needs canvas and real metrics, so the emulator is a fake that records what it was built
// with and what was installed on it; the factory's own decisions are what these cases pin.
const fake = vi.hoisted(() => ({
  built: [] as Record<string, unknown>[],
  oscHandlers: [] as { id: number; handle: (data: string) => boolean; dispose: () => void }[],
  terminals: [] as { opened?: HTMLElement; disposed: boolean; options: Record<string, unknown> }[],
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    opened?: HTMLElement;
    disposed = false;
    options: Record<string, unknown>;
    parser = {
      registerOscHandler: (id: number, handle: (data: string) => boolean) => {
        const entry = { id, handle, dispose: vi.fn() };
        fake.oscHandlers.push(entry);
        return { dispose: entry.dispose };
      },
    };

    constructor(options: Record<string, unknown>) {
      this.options = { ...options };
      fake.built.push(options);
      fake.terminals.push(this);
    }

    open(container: HTMLElement) { this.opened = container; }
    dispose() { this.disposed = true; }
  },
}));

const toBase64 = (text: string) => btoa(String.fromCodePoint(...new TextEncoder().encode(text)));

describe('createAppTerminal', () => {
  let container: HTMLElement;

  beforeEach(() => {
    fake.built.length = 0;
    fake.oscHandlers.length = 0;
    fake.terminals.length = 0;
    container = document.createElement('div');
  });

  afterEach(() => {
    for (const name of ['--mono', '--terminal-font-size', '--terminal-line-height']) {
      document.documentElement.style.removeProperty(name);
    }
    delete document.documentElement.dataset.theme;
  });

  it('reads the app\'s terminal metrics, and opens the terminal in the container', () => {
    document.documentElement.style.setProperty('--mono', 'Fira Code');
    document.documentElement.style.setProperty('--terminal-font-size', '16px');
    document.documentElement.style.setProperty('--terminal-line-height', '1.4');
    const { terminal } = createAppTerminal(container, { cursorBlink: true, cols: 120 });
    expect(fake.built[0]).toMatchObject({ fontFamily: 'Fira Code', fontSize: 16, lineHeight: 1.4, cursorBlink: true, cols: 120 });
    expect((terminal as unknown as { opened?: HTMLElement }).opened).toBe(container);
  });

  it('falls back to the app defaults when the stylesheet publishes no metrics', () => {
    createAppTerminal(container);
    expect(fake.built[0]).toMatchObject({ fontFamily: 'monospace', fontSize: 13.5, lineHeight: 1.2 });
  });

  it('copies an OSC 52 request through copyText when one is given', () => {
    const copyText = vi.fn();
    createAppTerminal(container, { copyText });
    const handler = fake.oscHandlers.find((entry) => entry.id === 52);
    expect(handler?.handle(`c;${toBase64('copied é')}`)).toBe(true);
    expect(copyText).toHaveBeenCalledWith('copied é');
    handler?.handle('c;?');
    expect(copyText).toHaveBeenCalledTimes(1);
  });

  it('registers no OSC 52 handler without copyText', () => {
    createAppTerminal(container);
    expect(fake.oscHandlers).toEqual([]);
  });

  it('applies a theme function and applies it again when the app theme switches', async () => {
    let background = '#000';
    const theme = vi.fn(() => ({ background }));
    const { terminal } = createAppTerminal(container, { theme });
    expect(fake.built[0]).toMatchObject({ theme: { background: '#000' } });
    background = '#fff';
    document.documentElement.dataset.theme = 'light';
    await vi.waitFor(() => { expect(terminal.options.theme).toEqual({ background: '#fff' }); });
  });

  it('keeps a fixed theme as built when the app theme switches', async () => {
    const { terminal } = createAppTerminal(container, { theme: { background: '#123' } });
    document.documentElement.dataset.theme = 'light';
    await Promise.resolve();
    expect(terminal.options.theme).toEqual({ background: '#123' });
  });

  it('removes the theme observer and the OSC 52 handler, and disposes the terminal, on dispose', async () => {
    const theme = vi.fn(() => ({ background: '#000' }));
    const app = createAppTerminal(container, { theme, copyText: vi.fn() });
    app.dispose();
    expect(fake.oscHandlers[0]?.dispose).toHaveBeenCalledOnce();
    expect(fake.terminals[0]?.disposed).toBe(true);
    const calls = theme.mock.calls.length;
    document.documentElement.dataset.theme = 'light';
    await Promise.resolve();
    expect(theme).toHaveBeenCalledTimes(calls);
  });
});
