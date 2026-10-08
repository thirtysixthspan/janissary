import type React from 'react';
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useAnswerButtons } from './useAnswerButtons';

function makeButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.focus = vi.fn();
  return button;
}

function makeEvent(key: string, target: EventTarget | null = null, shiftKey = false) {
  return { key, shiftKey, target, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
}

function makeRow(count: number) {
  const { result } = renderHook(() => useAnswerButtons(count));
  const buttons = Array.from({ length: count }, () => makeButton());
  for (const [i, button] of buttons.entries()) result.current.getRef(i)(button);
  return { result, buttons };
}

describe('useAnswerButtons', () => {
  it('Tab and ArrowRight move focus to the button after the focused one, wrapping from the last to the first', () => {
    const { result, buttons } = makeRow(3);

    const e1 = makeEvent('Tab', buttons[0]);
    result.current.onKeyDown(e1);
    expect(e1.preventDefault).toHaveBeenCalled();
    expect(buttons[1].focus).toHaveBeenCalled();

    result.current.onKeyDown(makeEvent('ArrowRight', buttons[1]));
    expect(buttons[2].focus).toHaveBeenCalled();

    result.current.onKeyDown(makeEvent('ArrowRight', buttons[2]));
    expect(buttons[0].focus).toHaveBeenCalled();
  });

  it('Shift+Tab and ArrowLeft move focus to the button before the focused one, wrapping from the first to the last', () => {
    const { result, buttons } = makeRow(3);

    result.current.onKeyDown(makeEvent('ArrowLeft', buttons[0]));
    expect(buttons[2].focus).toHaveBeenCalled();

    result.current.onKeyDown(makeEvent('Tab', buttons[2], true));
    expect(buttons[1].focus).toHaveBeenCalled();
  });

  it('steps from whichever button the key landed on, however focus got there', () => {
    const { result, buttons } = makeRow(3);

    result.current.onKeyDown(makeEvent('Tab', buttons[0]));
    expect(buttons[1].focus).toHaveBeenCalledOnce();

    result.current.onKeyDown(makeEvent('Tab', buttons[0]));
    expect(buttons[1].focus).toHaveBeenCalledTimes(2);
    expect(buttons[2].focus).not.toHaveBeenCalled();
  });

  it('moves forward to the first button and backward to the last when the key did not land on one', () => {
    const { result, buttons } = makeRow(3);
    const outside = document.createElement('div');

    result.current.onKeyDown(makeEvent('Tab', outside));
    expect(buttons[0].focus).toHaveBeenCalled();

    result.current.onKeyDown(makeEvent('ArrowLeft', outside));
    expect(buttons[2].focus).toHaveBeenCalled();
  });

  it('Shift+Tab from a preceding field moves focus to the last button', () => {
    const { result, buttons } = makeRow(2);

    const e = makeEvent('Tab', null, true);
    result.current.onFieldKeyDown(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(buttons[1].focus).toHaveBeenCalled();

    result.current.onKeyDown(makeEvent('Tab', buttons[1], true));
    expect(buttons[0].focus).toHaveBeenCalled();
  });

  it('leaves every other key in a preceding field alone', () => {
    const { result, buttons } = makeRow(2);

    for (const e of [makeEvent('Tab'), makeEvent('ArrowLeft'), makeEvent('a')]) {
      result.current.onFieldKeyDown(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    expect(buttons[0].focus).not.toHaveBeenCalled();
    expect(buttons[1].focus).not.toHaveBeenCalled();
  });

  it('ignores other keys without calling preventDefault', () => {
    const { result } = makeRow(2);
    const e = makeEvent('Enter');
    result.current.onKeyDown(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});
