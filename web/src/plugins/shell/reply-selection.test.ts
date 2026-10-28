import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPLY_HIGHLIGHT, holdReplySelection, shellSelectionText } from './reply-selection';

afterEach(() => {
  Reflect.deleteProperty(document, 'caretPositionFromPoint');
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function box(left: number, top: number, right: number, bottom: number): DOMRect {
  return { left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) };
}

function mount() {
  const container = document.createElement('div');
  const xterm = document.createElement('div');
  const row = document.createElement('div');
  row.textContent = 'terminal row';
  const reply = document.createElement('div');
  reply.className = 'shell-output-block';
  const paragraph = document.createElement('p');
  paragraph.textContent = 'first reply line';
  const link = document.createElement('a');
  link.href = 'https://example.com/';
  link.textContent = 'a link';
  reply.append(paragraph, link);
  xterm.append(row, reply);
  container.append(xterm);
  document.body.append(container);
  container.getBoundingClientRect = () => box(0, 0, 500, 400);
  reply.getBoundingClientRect = () => box(0, 100, 500, 200);
  const text = paragraph.firstChild!;
  Object.defineProperty(document, 'caretPositionFromPoint', {
    configurable: true,
    value: (x: number, y: number) => (y >= 100 && y < 200
      ? { offsetNode: text, offset: Math.min(Math.round(x / 10), 16) }
      : { offsetNode: row.firstChild, offset: 0 }),
  });
  const terminalPresses: MouseEvent[] = [];
  xterm.addEventListener('mousedown', (event) => {
    event.preventDefault();
    terminalPresses.push(event);
  });
  const terminal = { clearSelection: vi.fn() };
  const hold = holdReplySelection(container, terminal);
  return { hold, link, paragraph, reply, row, terminal, terminalPresses };
}

function drag(from: Element, [fromX, fromY]: [number, number], [toX, toY]: [number, number]): void {
  fireEvent.mouseDown(from, { button: 0, clientX: fromX, clientY: fromY });
  fireEvent.mouseMove(document, { clientX: toX, clientY: toY });
  fireEvent.mouseUp(document, { button: 0, clientX: toX, clientY: toY });
}

describe('holdReplySelection', () => {
  it('keeps a press on a reply from the terminal and from the browser, and clears the terminal selection', () => {
    const { paragraph, terminal, terminalPresses } = mount();

    expect(fireEvent.mouseDown(paragraph, { button: 0, clientX: 60, clientY: 150 })).toBe(false);

    expect(terminalPresses).toEqual([]);
    expect(terminal.clearSelection).toHaveBeenCalledTimes(1);
  });

  it('leaves a press on terminal rows to the terminal', () => {
    const { row, terminal, terminalPresses } = mount();

    fireEvent.mouseDown(row, { button: 0, clientX: 60, clientY: 50 });

    expect(terminalPresses).toHaveLength(1);
    expect(terminal.clearSelection).not.toHaveBeenCalled();
  });

  it('holds the text between the caret under the press and the caret under the release', () => {
    const { hold, paragraph } = mount();

    drag(paragraph, [60, 150], [160, 150]);

    expect(hold.text()).toBe('reply line');
  });

  it('selects backwards when the pointer ends before the press', () => {
    const { hold, paragraph } = mount();

    drag(paragraph, [160, 150], [60, 150]);

    expect(hold.text()).toBe('reply line');
  });

  it('runs to the end of the reply below it and to its start above it', () => {
    const { hold, paragraph } = mount();

    drag(paragraph, [60, 150], [60, 300]);
    expect(hold.text()).toBe('reply linea link');

    drag(paragraph, [50, 150], [50, 20]);
    expect(hold.text()).toBe('first');
  });

  it('paints the selection while dragging and removes it when cleared', () => {
    const highlights = new Map<string, Set<Range>>();
    vi.stubGlobal('CSS', { highlights });
    vi.stubGlobal('Highlight', class extends Set<Range> {});
    const { hold, paragraph } = mount();
    const painted = () => [...highlights.get(REPLY_HIGHLIGHT) ?? []].map(String);

    fireEvent.mouseDown(paragraph, { button: 0, clientX: 60, clientY: 150 });
    fireEvent.mouseMove(document, { clientX: 160, clientY: 150 });
    expect(painted()).toEqual(['reply line']);
    fireEvent.mouseUp(document, { button: 0, clientX: 160, clientY: 150 });
    expect(painted()).toEqual(['reply line']);

    hold.clear();
    expect(painted()).toEqual([]);
  });

  it('reads a selection inside one code line with the code block around it', () => {
    const { hold, reply } = mount();
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = '  indented code';
    pre.append(code);
    reply.append(pre);
    const codeText = code.firstChild!;
    Object.defineProperty(document, 'caretPositionFromPoint', {
      configurable: true,
      value: (x: number) => ({ offsetNode: codeText, offset: Math.round(x / 10) }),
    });
    const append = vi.spyOn(document.body, 'append');

    drag(code, [0, 150], [80, 150]);

    const holder = append.mock.calls.at(-1)?.[0] as HTMLElement;
    expect(holder.innerHTML).toBe('<pre><code>  indent</code></pre>');
    expect(hold.text()).toBe('  indent');
    append.mockRestore();
  });

  it('holds nothing for a press released where it started', () => {
    const { hold, paragraph } = mount();

    drag(paragraph, [60, 150], [60, 150]);

    expect(hold.text()).toBe('');
  });

  it('keeps the hold through a right-button press and drops it on the next primary press', () => {
    const { hold, paragraph, reply, row } = mount();
    drag(paragraph, [60, 150], [160, 150]);

    fireEvent.mouseDown(reply, { button: 2, clientX: 100, clientY: 150 });
    expect(hold.text()).toBe('reply line');

    fireEvent.mouseDown(row, { button: 0, clientX: 60, clientY: 50 });
    expect(hold.text()).toBe('');
  });

  it('keeps the click that ends a drag from following a link, but not a later click', async () => {
    const { link, paragraph, reply } = mount();
    const followed = vi.fn();
    reply.addEventListener('click', followed);
    drag(paragraph, [60, 150], [160, 150]);

    expect(fireEvent.click(link)).toBe(false);
    expect(followed).not.toHaveBeenCalled();

    await new Promise((resolve) => { setTimeout(resolve, 0); });
    fireEvent.click(link);
    expect(followed).toHaveBeenCalledTimes(1);
  });

  it('releases the hold and its listeners when disposed', () => {
    const { hold, paragraph, terminalPresses } = mount();
    drag(paragraph, [60, 150], [160, 150]);

    hold.dispose();
    fireEvent.mouseDown(paragraph, { button: 0, clientX: 60, clientY: 150 });

    expect(hold.text()).toBe('');
    expect(terminalPresses).toHaveLength(1);
  });
});

describe('shellSelectionText', () => {
  it('reads the held reply text before the terminal selection', () => {
    const { hold, paragraph } = mount();
    const terminal = { hasSelection: () => true, getSelection: () => 'terminal text' };
    drag(paragraph, [60, 150], [160, 150]);

    expect(shellSelectionText(hold, terminal)).toBe('reply line');
    hold.clear();
    expect(shellSelectionText(hold, terminal)).toBe('terminal text');
    expect(shellSelectionText(null, null)).toBe('');
  });
});
