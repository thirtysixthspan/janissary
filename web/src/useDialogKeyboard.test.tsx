import { fireEvent, render, screen } from '@testing-library/react';
import React, { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useDialogKeyboard, type DialogKeyMap } from './useDialogKeyboard';

function Dialog({ keys }: { keys: ((e: KeyboardEvent) => void) | DialogKeyMap }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogKeyboard(dialogRef, keys);
  return (
    <div>
      <div ref={dialogRef} tabIndex={-1} data-testid="dialog">
        <button>inside</button>
      </div>
      <button>outside</button>
    </div>
  );
}

// A dialog whose map is rebuilt from current state each render — the pattern that lets the map
// consumers drop their latest-value refs.
function CountingDialog({ onEnter }: { onEnter: (count: number) => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  useDialogKeyboard(dialogRef, {
    arrowright: () => setCount((c) => c + 1),
    enter: () => onEnter(count),
  });
  return <div ref={dialogRef} tabIndex={-1} />;
}

describe('useDialogKeyboard', () => {
  it('focuses the dialog element on mount', () => {
    render(<Dialog keys={vi.fn<(e: KeyboardEvent) => void>()} />);

    expect(screen.getByTestId('dialog')).toHaveFocus();
  });

  it('passes the raw event through in function form without swallowing it', () => {
    const onKeyDown = vi.fn<(e: KeyboardEvent) => void>();
    render(<Dialog keys={onKeyDown} />);

    const event = new KeyboardEvent('keydown', { key: 'q', cancelable: true, bubbles: true });
    document.dispatchEvent(event);

    expect(onKeyDown).toHaveBeenCalledWith(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('dispatches by lowercased key in map form', () => {
    const onY = vi.fn();
    render(<Dialog keys={{ y: onY }} />);

    fireEvent.keyDown(document, { key: 'y' });
    fireEvent.keyDown(document, { key: 'Y' });

    expect(onY).toHaveBeenCalledTimes(2);
  });

  it('swallows unmapped keys too, not just the mapped ones', () => {
    render(<Dialog keys={{ y: vi.fn() }} />);

    const unmapped = new KeyboardEvent('keydown', { key: 'q', cancelable: true, bubbles: true });
    document.dispatchEvent(unmapped);

    expect(unmapped.defaultPrevented).toBe(true);
  });

  it('runs the latest map across re-renders rather than the one present at mount', () => {
    const onEnter = vi.fn();
    render(<CountingDialog onEnter={onEnter} />);

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'Enter' });

    expect(onEnter).toHaveBeenCalledWith(2);
  });

  it('swallows a click outside the dialog but lets one inside through', () => {
    render(<Dialog keys={{}} />);

    const inside = screen.getByRole('button', { name: 'inside' });
    const outside = screen.getByRole('button', { name: 'outside' });

    expect(fireEvent.click(outside)).toBe(false);
    expect(fireEvent.click(inside)).toBe(true);
  });

  it('removes both capture listeners on unmount', () => {
    const onKeyDown = vi.fn<(e: KeyboardEvent) => void>();
    const { unmount } = render(<Dialog keys={onKeyDown} />);

    unmount();
    fireEvent.keyDown(document, { key: 'y' });
    const outsideClick = new MouseEvent('click', { cancelable: true, bubbles: true });
    document.body.dispatchEvent(outsideClick);

    expect(onKeyDown).not.toHaveBeenCalled();
    expect(outsideClick.defaultPrevented).toBe(false);
  });
});
