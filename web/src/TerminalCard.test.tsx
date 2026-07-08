import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { TerminalCard } from './TerminalCard';
import type { JanusClient } from './ws';

vi.mock('./useXterm', () => ({
  useXterm: vi.fn(() => () => {}),
}));

import { useXterm } from './useXterm';
const mockedUseXterm = useXterm as ReturnType<typeof vi.fn>;

function fakeClient(overrides: Partial<JanusClient> = {}): JanusClient {
  return { send: vi.fn(), ...overrides } as unknown as JanusClient;
}

describe('TerminalCard', () => {
  it('renders the program name', () => {
    render(<TerminalCard entry={{ ptyId: 'p1', program: 'npm start', status: 'running', exitCode: undefined }} client={fakeClient()} />);
    expect(screen.getByText(/npm start/)).toBeInTheDocument();
  });

  it('renders "running" status', () => {
    render(<TerminalCard entry={{ ptyId: 'p1', program: 'test', status: 'running', exitCode: undefined }} client={fakeClient()} />);
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('renders exited status with exit code', () => {
    render(<TerminalCard entry={{ ptyId: 'p1', program: 'test', status: 'exited', exitCode: 1 }} client={fakeClient()} />);
    expect(screen.getByText('exited (1)')).toBeInTheDocument();
  });

  it('renders exited status without exit code', () => {
    render(<TerminalCard entry={{ ptyId: 'p1', program: 'test', status: 'exited', exitCode: undefined }} client={fakeClient()} />);
    expect(screen.getByText('exited')).toBeInTheDocument();
  });

  it('shows maximize button initially and toggles to restore on click', () => {
    render(<TerminalCard entry={{ ptyId: 'p1', program: 'test', status: 'running', exitCode: undefined }} client={fakeClient()} />);
    const button = screen.getByText('maximize');
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByText('restore')).toBeInTheDocument();
  });

  it('shows kill button when not exited', () => {
    render(<TerminalCard entry={{ ptyId: 'p1', program: 'test', status: 'running', exitCode: undefined }} client={fakeClient()} />);
    expect(screen.getByText('kill')).toBeInTheDocument();
  });

  it('hides kill button when exited', () => {
    render(<TerminalCard entry={{ ptyId: 'p1', program: 'test', status: 'exited', exitCode: 0 }} client={fakeClient()} />);
    expect(screen.queryByText('kill')).not.toBeInTheDocument();
  });

  it('sends ptyKill with the pty id when kill is clicked', () => {
    const client = fakeClient();
    render(<TerminalCard entry={{ ptyId: 'my-pty', program: 'test', status: 'running', exitCode: undefined }} client={client} />);
    fireEvent.click(screen.getByText('kill'));
    expect(client.send).toHaveBeenCalledWith({ method: 'ptyKill', params: { id: 'my-pty' } });
  });

  it('applies the maximized class when toggled', () => {
    const { container } = render(<TerminalCard entry={{ ptyId: 'p1', program: 'test', status: 'running', exitCode: undefined }} client={fakeClient()} />);
    expect(container.querySelector('.terminal-card.maximized')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('maximize'));
    expect(container.querySelector('.terminal-card.maximized')).toBeInTheDocument();
  });

  it('passes a keyFilter that blocks shift+ctrl and allows plain keys', () => {
    mockedUseXterm.mockClear();
    render(<TerminalCard entry={{ ptyId: 'p1', program: 'test', status: 'running', exitCode: undefined }} client={fakeClient()} />);
    const opts = mockedUseXterm.mock.calls[0][0];
    const filter = opts.keyFilter as (e: KeyboardEvent) => boolean;

    expect(filter(new KeyboardEvent('keyup', { key: 'a' }))).toBe(true);
    expect(filter(new KeyboardEvent('keydown', { key: 'a' }))).toBe(true);
    expect(filter(new KeyboardEvent('keydown', { key: 'a', shiftKey: true }))).toBe(false);
    expect(filter(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }))).toBe(false);
  });
});
