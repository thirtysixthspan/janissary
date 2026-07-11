import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { BufferLine } from '@shared/protocol';
import type { JanusClient } from './ws';
import { NotificationsTab } from './NotificationsTab';

// jsdom doesn't include ResizeObserver — Transcript observes its content element.
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

const lines: BufferLine[] = [{ type: 'output', text: "Agent 'deploy' finished" }];

describe('NotificationsTab', () => {
  it('does not show the "help" hint when there are no notifications yet', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    render(<NotificationsTab lines={[]} client={client} index={0} />);
    expect(screen.queryByText('Type "help" for available commands.')).toBeNull();
  });

  it('renders bufferLines as a transcript with no command bar', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<NotificationsTab lines={lines} client={client} index={0} />);
    expect(container.querySelector('.transcript')).not.toBeNull();
    expect(screen.getByText("Agent 'deploy' finished")).toBeTruthy();
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('shows no dock-cycle button when undocked', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    render(<NotificationsTab lines={lines} client={client} index={0} />);
    expect(screen.queryByTitle('Move to left sidebar')).toBeNull();
    expect(screen.queryByTitle('Move to right sidebar')).toBeNull();
  });

  it('when docked left, shows the dock-cycle button, which sends setDock to right', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<NotificationsTab lines={lines} client={client} index={2} dock="left" />);
    fireEvent.click(screen.getByTitle('Move to right sidebar'));
    expect(send).toHaveBeenCalledWith({ method: 'setDock', params: { index: 2, dock: 'right' } });
  });
});
