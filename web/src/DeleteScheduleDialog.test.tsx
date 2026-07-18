import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteScheduleDialog } from './DeleteScheduleDialog';

describe('DeleteScheduleDialog', () => {
  it('renders the title with the given timer id and both buttons', () => {
    render(<DeleteScheduleDialog id="standup" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Delete schedule "standup"?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('calls onConfirm when the Delete button is clicked', async () => {
    const onConfirm = vi.fn();
    render(<DeleteScheduleDialog id="standup" onConfirm={onConfirm} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the Cancel button is clicked', async () => {
    const onCancel = vi.fn();
    render(<DeleteScheduleDialog id="standup" onConfirm={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
