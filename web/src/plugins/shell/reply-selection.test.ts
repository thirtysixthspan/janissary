import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPLY_HIGHLIGHT, holdReplySelection, shellSelectionText } from './reply-selection';

afterEach(() => {
  globalThis.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function mount() {
  const container = document.createElement('div');
  const xterm = document.createElement('div');
  const row = document.createElement('div');
  row.textContent = 'terminal row';
  const reply = document.createElement('div');
  reply.className = 'shell-output-block';
  const paragraph = document.createElement('p');
  paragraph.textContent = 'first reply line';
  reply.append(paragraph);
  const after = document.createElement('div');
  after.textContent = 'row after';
  xterm.append(row, reply, after);
  container.append(xterm);
  document.body.append(container);
  const terminalPresses: MouseEvent[] = [];
  xterm.addEventListener('mousedown', (event) => {
    event.preventDefault();
    terminalPresses.push(event);
  });
  const terminal = { clearSelection: vi.fn() };
  const onRelease = vi.fn();
  const hold = holdReplySelection(container, terminal, onRelease);
  return { after, hold, onRelease, paragraph, reply, row, terminal, terminalPresses, text: paragraph.firstChild! };
}

function selectFrom(anchor: Node, anchorOffset: number, focus: Node, focusOffset: number) {
  globalThis.getSelection()!.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
}

describe('holdReplySelection', () => {
  it('stops a press on a reply before the terminal cancels it, and clears the terminal selection', () => {
    const { paragraph, terminal, terminalPresses } = mount();

    expect(fireEvent.mouseDown(paragraph, { button: 0 })).toBe(true);

    expect(terminalPresses).toEqual([]);
    expect(terminal.clearSelection).toHaveBeenCalledTimes(1);
  });

  it('leaves a press on terminal rows to the terminal', () => {
    const { row, terminal, terminalPresses } = mount();

    fireEvent.mouseDown(row, { button: 0 });

    expect(terminalPresses).toHaveLength(1);
    expect(terminal.clearSelection).not.toHaveBeenCalled();
  });

  it('holds the reply text selected when the press is released, after the page selection is gone', () => {
    const { hold, onRelease, paragraph, text } = mount();

    fireEvent.mouseDown(paragraph, { button: 0 });
    selectFrom(text, 6, text, 16);
    fireEvent.mouseUp(paragraph, { button: 0 });
    globalThis.getSelection()!.removeAllRanges();

    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(hold.text()).toBe('reply line');
  });

  it('clips a selection dragged out of the reply to the reply', () => {
    const { after, hold, paragraph, row, text } = mount();

    fireEvent.mouseDown(paragraph, { button: 0 });
    selectFrom(text, 5, row.firstChild!, 0);
    fireEvent.mouseUp(row, { button: 0 });
    expect(hold.text()).toBe('first');

    fireEvent.mouseDown(paragraph, { button: 0 });
    selectFrom(text, 6, after.firstChild!, 3);
    fireEvent.mouseUp(after, { button: 0 });
    expect(hold.text()).toBe('reply line');
  });

  it('holds nothing for a press released without a selection, and still gives the keyboard back', () => {
    const { hold, onRelease, paragraph } = mount();

    fireEvent.mouseDown(paragraph, { button: 0 });
    fireEvent.mouseUp(paragraph, { button: 0 });

    expect(hold.text()).toBe('');
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('keeps the hold through a right-button press and drops it on the next primary press', () => {
    const { hold, paragraph, reply, row, text } = mount();
    fireEvent.mouseDown(paragraph, { button: 0 });
    selectFrom(text, 6, text, 16);
    fireEvent.mouseUp(paragraph, { button: 0 });

    fireEvent.mouseDown(reply, { button: 2 });
    expect(hold.text()).toBe('reply line');

    fireEvent.mouseDown(row, { button: 0 });
    expect(hold.text()).toBe('');
  });

  it('paints the held range with the shared highlight and removes it when cleared', () => {
    const highlights = new Map<string, Set<Range>>();
    vi.stubGlobal('CSS', { highlights });
    vi.stubGlobal('Highlight', class extends Set<Range> {});
    const { hold, paragraph, text } = mount();

    fireEvent.mouseDown(paragraph, { button: 0 });
    selectFrom(text, 6, text, 16);
    fireEvent.mouseUp(paragraph, { button: 0 });
    expect([...highlights.get(REPLY_HIGHLIGHT)!].map(String)).toEqual(['reply line']);

    hold.clear();
    expect(highlights.get(REPLY_HIGHLIGHT)!.size).toBe(0);
  });

  it('releases the hold and its listeners when disposed', () => {
    const { hold, paragraph, terminalPresses, text } = mount();
    fireEvent.mouseDown(paragraph, { button: 0 });
    selectFrom(text, 6, text, 16);
    fireEvent.mouseUp(paragraph, { button: 0 });

    hold.dispose();
    fireEvent.mouseDown(paragraph, { button: 0 });

    expect(hold.text()).toBe('');
    expect(terminalPresses).toHaveLength(1);
  });
});

describe('shellSelectionText', () => {
  it('reads the held reply text before the terminal selection', () => {
    const { hold, paragraph, text } = mount();
    const terminal = { hasSelection: () => true, getSelection: () => 'terminal text' };
    fireEvent.mouseDown(paragraph, { button: 0 });
    selectFrom(text, 6, text, 16);
    fireEvent.mouseUp(paragraph, { button: 0 });

    expect(shellSelectionText(hold, terminal)).toBe('reply line');
    hold.clear();
    expect(shellSelectionText(hold, terminal)).toBe('terminal text');
    expect(shellSelectionText(null, null)).toBe('');
  });
});
