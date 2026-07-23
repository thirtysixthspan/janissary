import type React from 'react';
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useAnswerButtons } from './useAnswerButtons';

function makeButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.focus = vi.fn();
  return button;
}

function makeEvent(key: string, shiftKey = false) {
  return { key, shiftKey, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
}

describe('useAnswerButtons', () => {
  it('Tab and ArrowRight move focus to the next button, wrapping from the last to the first', () => {
    const { result } = renderHook(() => useAnswerButtons(3, 0));
    const buttons = [makeButton(), makeButton(), makeButton()];
    result.current.getRef(0)(buttons[0]);
    result.current.getRef(1)(buttons[1]);
    result.current.getRef(2)(buttons[2]);

    const e1 = makeEvent('Tab');
    result.current.onKeyDown(e1);
    expect(e1.preventDefault).toHaveBeenCalled();
    expect(buttons[1].focus).toHaveBeenCalled();

    result.current.onKeyDown(makeEvent('ArrowRight'));
    expect(buttons[2].focus).toHaveBeenCalled();

    result.current.onKeyDown(makeEvent('ArrowRight'));
    expect(buttons[0].focus).toHaveBeenCalled();
  });

  it('Shift+Tab and ArrowLeft move focus to the previous button, wrapping from the first to the last', () => {
    const { result } = renderHook(() => useAnswerButtons(3, 0));
    const buttons = [makeButton(), makeButton(), makeButton()];
    result.current.getRef(0)(buttons[0]);
    result.current.getRef(1)(buttons[1]);
    result.current.getRef(2)(buttons[2]);

    result.current.onKeyDown(makeEvent('ArrowLeft'));
    expect(buttons[2].focus).toHaveBeenCalled();

    result.current.onKeyDown(makeEvent('Tab', true));
    expect(buttons[1].focus).toHaveBeenCalled();
  });

  it('starts from the given initial index', () => {
    const { result } = renderHook(() => useAnswerButtons(2, 1));
    const buttons = [makeButton(), makeButton()];
    result.current.getRef(0)(buttons[0]);
    result.current.getRef(1)(buttons[1]);

    result.current.onKeyDown(makeEvent('ArrowRight'));
    expect(buttons[0].focus).toHaveBeenCalled();
  });

  it('ignores other keys without calling preventDefault', () => {
    const { result } = renderHook(() => useAnswerButtons(2, 0));
    const e = makeEvent('Enter');
    result.current.onKeyDown(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});
