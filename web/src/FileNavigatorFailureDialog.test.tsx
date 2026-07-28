import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FileNavigatorFailureDialog } from './FileNavigatorFailureDialog';

describe('FileNavigatorFailureDialog', () => {
  it('shows the exact count and failed paths in order', () => {
    render(
      <FileNavigatorFailureDialog
        failure={{ operation: 'move', total: 3, failedPaths: ['a', 'dir/b'] }}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('Could not move 2 of 3 items.')).toBeInTheDocument();
    expect(screen.getAllByText(/^(a|dir\/b)$/).map((node) => node.textContent)).toEqual(['a', 'dir/b']);
  });

  it('dismisses by button, Enter, and Escape', async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <FileNavigatorFailureDialog
        failure={{ operation: 'delete', total: 2, failedPaths: ['a'] }}
        onDismiss={onDismiss}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(3);
    rerender(<div />);
  });
});
