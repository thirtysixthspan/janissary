import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../shared/ws/ws';
import { Sidebar } from '../Sidebar';
import { createPluginHost, PluginHostProvider } from './host';
import { clientPlugin } from './registry';
import { PluginTabLayer } from './PluginTabLayer';

function connectionsTab(dock: 'left' | 'right' | undefined, label = 'connections'): TabView {
  return {
    label, number: 1, dotColor: '#5b9cff', group: 1, groupColor: '#5b9cff', busy: false,
    hasUnread: false, cwd: '/tmp', connections: [], schedule: [], bufferLines: [], cmdHistory: [],
    commandQueue: [], view: 'plugin', dock, title: label,
    plugin: { id: 'connections', schemaVersion: 1, payload: { kind: 'list', rows: [] } },
  };
}

function fixture() {
  const send = vi.fn();
  const request = vi.fn(async () => ({ ok: true, value: null }));
  const client = { send, request } as unknown as JanusClient;
  const host = createPluginHost(new Map([
    ['connections', clientPlugin(1, () => import('./connections/index'))],
  ]));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PluginHostProvider host={host}>{children}</PluginHostProvider>
  );
  return { send, request, client, wrapper };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('Connections metadata controls', () => {
  it.each(['left', 'right'] as const)('shares one bar and routes both controls when docked %s', async (side) => {
    const { client, wrapper, send, request } = fixture();
    const otherSide = side === 'left' ? 'right' : 'left';
    const { container } = render(<Sidebar side={side} tabs={[connectionsTab(side)]} client={client} />, { wrapper });

    const refresh = await screen.findByRole('button', { name: 'Refresh' });
    const dock = screen.getByRole('button', { name: `Move to ${otherSide} sidebar` });
    const header = container.querySelector('.sidebar-plugin-header');
    expect(header).toContainElement(refresh);
    expect(header).toContainElement(dock);
    expect(container.querySelectorAll('.sidebar-plugin-header, .connections-list-header')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Split' })).not.toBeInTheDocument();
    expect(screen.getByText('No connections yet')).toBeInTheDocument();

    fireEvent.click(refresh);
    expect(request).toHaveBeenCalledExactlyOnceWith({
      method: 'pluginIntent', params: { tab: 'connections', intent: 'refresh', payload: {} },
    });
    fireEvent.click(dock);
    expect(send).toHaveBeenCalledExactlyOnceWith({
      method: 'setDock', params: { index: 0, dock: otherSide },
    });
  });

  it('holds Refresh and Split in the centre metadata row when undocked', async () => {
    const { client, wrapper } = fixture();
    const tab = connectionsTab(undefined);
    const split = vi.fn();
    const { container } = render(<PluginTabLayer tab={tab} index={0} current={tab} visible
      client={client} onClose={vi.fn()} onSplit={split} />, { wrapper });

    const refresh = await screen.findByRole('button', { name: 'Refresh' });
    const splitButton = screen.getByRole('button', { name: 'Split' });
    const header = container.querySelector('.connections-list-header');
    expect(header).toContainElement(refresh);
    expect(header).toContainElement(splitButton);
    expect(container.querySelectorAll('.sidebar-plugin-header, .connections-list-header')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Move to .* sidebar/ })).not.toBeInTheDocument();
    fireEvent.click(splitButton);
    expect(split).toHaveBeenCalledOnce();
  });
});
