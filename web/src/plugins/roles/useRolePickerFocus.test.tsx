import React, { useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRolePickerFocus } from './useRolePickerFocus';

function PickerHarness({ canOpen = true }: { canOpen?: boolean }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const picker = useRolePickerFocus(canOpen, headingRef);
  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1}>Heading</h2>
      {picker.open ? (
        <select ref={picker.firstControlRef} aria-label="First control" />
      ) : (
        <button
          ref={picker.openerRef}
          type="button"
          onFocus={picker.onOpenerFocus}
          onBlur={picker.onOpenerBlur}
          onClick={picker.openPicker}
        >
          Add
        </button>
      )}
      <button type="button" onClick={picker.closePicker}>Close</button>
    </div>
  );
}

describe('useRolePickerFocus', () => {
  it('focuses the first control on open and returns focus to the opener on close', () => {
    render(<PickerHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByLabelText('First control')).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus();
  });

  it('moves focus to the heading when a close leaves no opener available', () => {
    const { rerender } = render(<PickerHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByLabelText('First control')).toHaveFocus();

    rerender(<PickerHarness canOpen={false} />);

    expect(screen.getByRole('heading', { name: 'Heading' })).toHaveFocus();
  });
});
