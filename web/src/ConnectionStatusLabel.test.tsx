import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ConnectionStatusLabel } from './ConnectionStatusLabel';

it('renders the fixed wording and hides a settled connection', () => {
  const { rerender } = render(<ConnectionStatusLabel status="reconnecting" />);
  expect(screen.getByRole('status').textContent).toBe('Reconnecting…');
  rerender(<ConnectionStatusLabel status="escalated" />);
  expect(screen.getByRole('status').textContent).toBe('Cannot reach session');
  rerender(<ConnectionStatusLabel status="reconnected" />);
  expect(screen.getByRole('status').textContent).toBe('Reconnected');
  rerender(<ConnectionStatusLabel status="connected" />);
  expect(screen.queryByRole('status')).toBeNull();
});

// The indicator's appearance and its overlay positioning belong to the stylesheet, where the themes
// are defined — not to an inline style object the themes cannot reach.
it('takes its appearance from the stylesheet rather than an inline style', () => {
  render(<ConnectionStatusLabel status="reconnecting" />);
  const label = screen.getByRole('status');
  expect(label.className).toBe('connection-status');
  expect(label.getAttribute('style')).toBeNull();
});
