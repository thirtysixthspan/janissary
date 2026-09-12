import { describe, expect, it, vi } from 'vitest';
import { statusButton } from './status-button';

describe('statusButton', () => {
  it('preserves the content flag and status-window handlers', () => {
    const onButtonEnter = vi.fn();
    const onButtonLeave = vi.fn();
    const onButtonClick = vi.fn();

    const button = statusButton(true, {
      visible: false,
      opacity: 1,
      onButtonEnter,
      onButtonLeave,
      onButtonClick,
      onWindowEnter: vi.fn(),
      onWindowLeave: vi.fn(),
    });

    expect(button).toEqual({ hasContent: true, onEnter: onButtonEnter, onLeave: onButtonLeave, onClick: onButtonClick });
  });
});
