import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { ResizeButton } from './ResizeButton';

describe('ResizeButton', () => {
  it('exposes its label and forwards drag events', () => {
    const onResize = vi.fn();
    const { getByRole } = render(
      <ResizeButton direction="vertical" label="Resize monitoring area" onResize={onResize} />,
    );
    const button = getByRole('button', { name: 'Resize monitoring area' });

    fireEvent.mouseDown(button, { clientY: 400 });
    fireEvent.mouseMove(document, { clientY: 300 });

    expect(onResize).toHaveBeenCalledWith(expect.objectContaining({ clientY: 400 }), expect.objectContaining({ clientY: 300 }));
  });

  it('defaults to align-end, and takes align-start when requested', () => {
    const { getByRole, rerender } = render(
      <ResizeButton direction="vertical" label="Resize monitoring area" onResize={vi.fn()} />,
    );
    expect(getByRole('button').classList.contains('resize-align-end')).toBe(true);

    rerender(<ResizeButton direction="vertical" label="Resize monitoring area" onResize={vi.fn()} align="start" />);
    expect(getByRole('button').classList.contains('resize-align-start')).toBe(true);
  });
});
