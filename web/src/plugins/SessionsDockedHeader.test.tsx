import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { Sidebar } from '../Sidebar';
import { createPluginHost, PluginHostProvider } from './host';
import { clientPlugin } from './registry';
import { PluginTabLayer } from './PluginTabLayer';

function sessionTab(dock: 'left' | 'right', label = 'sessions'): TabView {
  return {
    label, number: 1, dotColor: '#5b9cff', group: 1, groupColor: '#5b9cff', busy: false,
    hasUnread: false, cwd: '/tmp', connections: [], schedule: [], bufferLines: [], cmdHistory: [],
    commandQueue: [], toolStepsExpanded: false, view: 'plugin', dock, title: label,
    plugin: { id: 'sessions', schemaVersion: 1, payload: { entries: [] } },
  };
}

function fixture() {
  const send = vi.fn();
  const request = vi.fn(async () => ({ ok: true, value: null }));
  const client = { send, request } as unknown as JanusClient;
  const host = createPluginHost(new Map([
    ['sessions', clientPlugin(1, () => import('./sessions/index'))],
  ]));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PluginHostProvider host={host}>{children}</PluginHostProvider>
  );
  return { send, request, client, wrapper };
}

describe('Sessions metadata controls in the sidebar', () => {
  it.each(['left', 'right'] as const)('shares one bar and routes both controls when docked %s', async (side) => {
    const { client, wrapper, send, request } = fixture();
    const otherSide = side === 'left' ? 'right' : 'left';
    const tabs = [sessionTab(otherSide, 'other'), sessionTab(side)];
    const { container } = render(<Sidebar side={side} tabs={tabs} client={client} />, { wrapper });

    const refresh = await screen.findByRole('button', { name: 'Refresh' });
    const dock = screen.getByRole('button', { name: `Move to ${otherSide} sidebar` });
    const header = container.querySelector('.sidebar-plugin-header');
    expect(header).toContainElement(refresh);
    expect(header).toContainElement(dock);
    expect(container.querySelectorAll('.sidebar-plugin-header, .session-list-header')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Split' })).not.toBeInTheDocument();
    expect(screen.getByText('No remote sessions')).toBeInTheDocument();

    fireEvent.click(refresh);
    expect(request).toHaveBeenCalledExactlyOnceWith({
      method: 'pluginIntent', params: { tab: 'sessions', intent: 'refresh', payload: {} },
    });
    fireEvent.click(dock);
    expect(send).toHaveBeenCalledExactlyOnceWith({
      method: 'setDock', params: { index: 1, dock: otherSide },
    });
  });

  it('keeps actions with their own tab across sidebar switches and removes them with the tab', async () => {
    const { client, wrapper, request } = fixture();
    const tabs = [sessionTab('left', 'first'), sessionTab('left', 'second')];
    const { container, rerender } = render(<Sidebar side="left" tabs={tabs} client={client} />, { wrapper });
    await screen.findByRole('button', { name: 'Refresh' });
    const frames = container.querySelectorAll<HTMLElement>('.sidebar-plugin');
    expect(frames).toHaveLength(2);
    for (const frame of frames) {
      expect(within(frame).getByRole('button', { name: 'Refresh', hidden: true })).toBeInTheDocument();
      expect(frame.querySelectorAll('.sidebar-plugin-header, .session-list-header')).toHaveLength(1);
    }

    fireEvent.mouseDown(screen.getByText('second'));
    expect(frames[0]).toHaveStyle({ display: 'none' });
    expect(frames[1]).toHaveStyle({ display: 'flex' });
    request.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(request).toHaveBeenCalledExactlyOnceWith({
      method: 'pluginIntent', params: { tab: 'second', intent: 'refresh', payload: {} },
    });

    rerender(<Sidebar side="left" tabs={[tabs[0]]} client={client} />);
    expect(container.querySelectorAll('.sidebar-plugin-header')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Refresh', hidden: true })).toHaveLength(1);
    expect(frames[1].isConnected).toBe(false);
  });

  it('restores the centre metadata header with Refresh and Split after undocking', async () => {
    const { client, wrapper } = fixture();
    const tab = sessionTab('left');
    const split = vi.fn();
    const { container, rerender } = render(<Sidebar side="left" tabs={[tab]} client={client} />, { wrapper });
    await screen.findByRole('button', { name: 'Refresh' });

    const centred = { ...tab, dock: undefined };
    rerender(<PluginTabLayer tab={centred} index={0} current={centred} visible
      client={client} onClose={vi.fn()} onSplit={split} />);

    const refresh = await screen.findByRole('button', { name: 'Refresh' });
    const splitButton = screen.getByRole('button', { name: 'Split' });
    const header = container.querySelector('.session-list-header');
    expect(header).toContainElement(refresh);
    expect(header).toContainElement(splitButton);
    expect(container.querySelectorAll('.sidebar-plugin-header, .session-list-header')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Move to .* sidebar/ })).not.toBeInTheDocument();
    fireEvent.click(splitButton);
    expect(split).toHaveBeenCalledOnce();
  });
});
