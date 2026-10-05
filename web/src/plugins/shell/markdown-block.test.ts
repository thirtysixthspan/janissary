import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import { insertMarkdownBlock } from './markdown-block';

type Fake = {
  terminal: Terminal;
  written: string[];
  markers: number[];
  decorations: { width?: number; height?: number; layer?: string }[];
  render: (element: HTMLElement) => void;
};

function fakeTerminal({ probeHeight = 48, screenHeight = 240, rows = 20, buffer = 'normal', withScreen = true } = {}): Fake {
  const element = document.createElement('div');
  if (withScreen) {
    const screen = document.createElement('div');
    screen.className = 'xterm-screen';
    Object.defineProperties(screen, { clientHeight: { value: screenHeight }, clientWidth: { value: 800 } });
    element.append(screen);
  }
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(probeHeight);
  const fake: Fake = { terminal: undefined as unknown as Terminal, written: [], markers: [], decorations: [], render: () => {} };
  fake.terminal = {
    element,
    rows,
    cols: 100,
    buffer: { active: { type: buffer } },
    write: (data: string, callback?: () => void) => { fake.written.push(data); callback?.(); },
    registerMarker: (offset: number) => { fake.markers.push(offset); return { line: 0 }; },
    registerDecoration: (options: { width?: number; height?: number; layer?: string }) => {
      fake.decorations.push({ width: options.width, height: options.height, layer: options.layer });
      return { onRender: (handler: (element: HTMLElement) => void) => { fake.render = handler; } };
    },
  } as unknown as Terminal;
  return fake;
}

describe('insertMarkdownBlock', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('reserves rows under the echoed command and renders the reply into a decoration over them', () => {
    const fake = fakeTerminal({ probeHeight: 48, screenHeight: 240, rows: 20 });

    expect(insertMarkdownBlock(fake.terminal, 'help', '# Commands\n\n| a | b |\n| - | - |\n| 1 | 2 |')).toBe(true);

    expect(fake.written[0]).toBe(`\r\u{1B}[2K> help\r\n${'\r\n'.repeat(4)}`);
    expect(fake.markers).toEqual([-4]);
    expect(fake.decorations).toEqual([{ width: 100, height: 4, layer: 'top' }]);
    expect(fake.written.at(-1)).toBe('> ');

    const element = document.createElement('div');
    fake.render(element);
    expect(element).toHaveClass('line', 'markdown', 'shell-output-block');
    expect(element.querySelector('h1')?.textContent).toBe('Commands');
    expect(element.querySelector(':scope table td')?.textContent).toBe('1');
  });

  it('reserves the full measured height for a reply taller than the viewport', () => {
    const fake = fakeTerminal({ probeHeight: 240, screenHeight: 240, rows: 4 });

    expect(insertMarkdownBlock(fake.terminal, 'help', 'a long reply')).toBe(true);

    expect(fake.written[0]).toBe(`\r\u{1B}[2K> help\r\n${'\r\n'.repeat(4)}`);
    expect(fake.markers).toEqual([-4]);
    expect(fake.decorations[0]?.height).toBe(4);
  });

  it('fills the decoration once however often it is rendered', () => {
    const fake = fakeTerminal();
    insertMarkdownBlock(fake.terminal, 'help', 'hello');
    const element = document.createElement('div');
    fake.render(element);
    element.append(document.createElement('span'));
    fake.render(element);

    expect(element.querySelectorAll('span')).toHaveLength(1);
  });

  it('places nothing when the reply measures nothing', () => {
    const fake = fakeTerminal({ probeHeight: 0 });
    expect(insertMarkdownBlock(fake.terminal, 'help', 'hello')).toBe(false);
    expect(fake.written).toEqual([]);
  });

  it('places nothing while a full-screen program holds the alternate buffer', () => {
    const fake = fakeTerminal({ buffer: 'alternate' });
    expect(insertMarkdownBlock(fake.terminal, 'help', 'hello')).toBe(false);
    expect(fake.written).toEqual([]);
  });

  it('places nothing before the terminal has a screen to measure against', () => {
    const fake = fakeTerminal({ withScreen: false });
    expect(insertMarkdownBlock(fake.terminal, 'help', 'hello')).toBe(false);
    expect(fake.written).toEqual([]);
  });
});
