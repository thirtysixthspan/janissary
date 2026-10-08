import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JanusClient } from '../../ws';
import { AcpResponseScope, useAcpResponse } from './AcpResponseScope';

function Consumer() { return useAcpResponse(); }

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('core ACP response surface', () => {
  it('renders server-owned streaming Markdown and resets the owning tab', () => {
    const send = vi.fn();
    const client = { send, attachPty: vi.fn() } as unknown as JanusClient;
    const { rerender } = render(
      <AcpResponseScope label="docked-shell" client={client} response={{ lines: [{ type: 'markdown', text: '# Partial' }], running: true }}>
        <Consumer />
      </AcpResponseScope>,
    );
    expect(screen.getByRole('heading', { name: 'Partial' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Responding');
    fireEvent.click(screen.getByRole('button', { name: 'Reset ACP' }));
    expect(send).toHaveBeenCalledWith({ method: 'resetAcp', params: { tab: 'docked-shell' } });
    rerender(
      <AcpResponseScope label="docked-shell" client={client} response={{ lines: [{ type: 'markdown', text: '# Finished' }], running: false }}>
        <Consumer />
      </AcpResponseScope>,
    );
    expect(screen.getByRole('heading', { name: 'Finished' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('routes a docked question answer to its own tab', () => {
    const send = vi.fn();
    const client = { send, attachPty: vi.fn() } as unknown as JanusClient;
    render(
      <AcpResponseScope label="shell" client={client} response={{ lines: [], running: true }}
        question={{ tab: 'shell', id: 'q1', kind: 'approve', question: 'Proceed?' }}>
        <Consumer />
      </AcpResponseScope>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(send).toHaveBeenCalledWith({ method: 'answerQuestion', params: { tab: 'shell', id: 'q1', answer: null } });
  });

  it('keeps tool-step keyboard controls on the panel owner', () => {
    const send = vi.fn();
    const client = { send, attachPty: vi.fn() } as unknown as JanusClient;
    render(
      <AcpResponseScope label="docked-shell" client={client} response={{ lines: [], running: false }}>
        <Consumer />
      </AcpResponseScope>,
    );
    const panel = screen.getByRole('region', { name: 'ACP responses' });
    fireEvent.keyDown(panel, { key: 't', ctrlKey: true });
    expect(send).toHaveBeenCalledWith({ method: 'toggleCollapse', params: { tab: 'docked-shell' } });
    expect(panel).toHaveFocus();
  });
});
