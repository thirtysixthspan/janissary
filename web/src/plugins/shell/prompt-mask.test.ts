import { describe, it, expect } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import { PROMPT_MASK_CLASS, attachPromptMask } from './prompt-mask';

type FakeDecoration = {
  options: { x?: number; width?: number; layer?: string };
  line: number;
  disposed: boolean;
  render: (element: HTMLElement) => void;
};

// Just the surface the mask touches: the input textarea for focus, the cursor's position, cursor
// moves, and markers with decorations on them.
function fakeTerminal() {
  const textarea = document.createElement('textarea');
  document.body.append(textarea);
  const buffer = { active: { baseY: 10, cursorY: 3, type: 'normal' } };
  const cursorListeners = new Set<() => void>();
  const decorations: FakeDecoration[] = [];
  const terminal = {
    textarea,
    buffer,
    onCursorMove: (listener: () => void) => {
      cursorListeners.add(listener);
      return { dispose: () => { cursorListeners.delete(listener); } };
    },
    registerMarker: () => {
      const marker = { line: buffer.active.baseY + buffer.active.cursorY, disposed: false, dispose: () => { marker.disposed = true; } };
      return marker;
    },
    registerDecoration: (options: FakeDecoration['options'] & { marker: { line: number } }) => {
      const decoration: FakeDecoration = {
        options, line: options.marker.line, disposed: false, render: () => {},
      };
      decorations.push(decoration);
      return {
        onRender: (handler: (element: HTMLElement) => void) => { decoration.render = handler; },
        dispose: () => { decoration.disposed = true; },
      };
    },
  };
  return {
    terminal: terminal as unknown as Terminal,
    textarea,
    decorations,
    live: () => decorations.filter((decoration) => !decoration.disposed),
    moveCursor: (cursorY: number) => {
      buffer.active.cursorY = cursorY;
      for (const listener of cursorListeners) listener();
    },
    cleanup: () => { textarea.remove(); },
  };
}

describe('attachPromptMask', () => {
  it('masks nothing while the shell is running, focused or not', () => {
    const fake = fakeTerminal();
    const mask = attachPromptMask(fake.terminal);
    mask.setIdle(false);
    expect(fake.live()).toEqual([]);
    fake.textarea.focus();
    fake.textarea.blur();
    expect(fake.live()).toEqual([]);
    fake.cleanup();
  });

  it('covers the prompt cells on the cursor row while idle and unfocused', () => {
    const fake = fakeTerminal();
    const mask = attachPromptMask(fake.terminal);
    mask.setIdle(true);

    expect(fake.live()).toHaveLength(1);
    expect(fake.live()[0]).toMatchObject({ line: 13, options: { x: 0, width: 2, layer: 'top' } });
    const element = document.createElement('div');
    fake.live()[0].render(element);
    expect(element).toHaveClass(PROMPT_MASK_CLASS);
    fake.cleanup();
  });

  it('removes the mask while the terminal has focus and restores it on blur', () => {
    const fake = fakeTerminal();
    const mask = attachPromptMask(fake.terminal);
    mask.setIdle(true);

    fake.textarea.focus();
    expect(fake.live()).toEqual([]);
    fake.textarea.blur();
    expect(fake.live()).toHaveLength(1);
    fake.cleanup();
  });

  it('starts unmasked when the terminal already holds focus', () => {
    const fake = fakeTerminal();
    fake.textarea.focus();
    const mask = attachPromptMask(fake.terminal);
    mask.setIdle(true);
    expect(fake.live()).toEqual([]);
    fake.cleanup();
  });

  it('removes the mask when a command starts', () => {
    const fake = fakeTerminal();
    const mask = attachPromptMask(fake.terminal);
    mask.setIdle(true);
    mask.setIdle(false);
    expect(fake.live()).toEqual([]);
    fake.cleanup();
  });

  it('follows the cursor to the row zsh draws the next prompt on', () => {
    const fake = fakeTerminal();
    const mask = attachPromptMask(fake.terminal);
    mask.setIdle(true);
    const first = fake.live()[0];

    fake.moveCursor(3);
    expect(fake.live()).toEqual([first]);

    fake.moveCursor(5);
    expect(first.disposed).toBe(true);
    expect(fake.live()).toHaveLength(1);
    expect(fake.live()[0].line).toBe(15);
    fake.cleanup();
  });

  it('removes the mask and stops following the cursor once disposed', () => {
    const fake = fakeTerminal();
    const mask = attachPromptMask(fake.terminal);
    mask.setIdle(true);

    mask.dispose();
    fake.moveCursor(6);
    fake.textarea.focus();
    fake.textarea.blur();
    expect(fake.live()).toEqual([]);
    expect(fake.decorations).toHaveLength(1);
    fake.cleanup();
  });
});
