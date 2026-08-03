import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { Sidebar } from '../Sidebar';
import {
  clearClientPluginFailures,
  clientPlugin,
  clientPluginRegistry,
  type ClientPluginRegistration,
} from './registry';

const registry = clientPluginRegistry as Map<string, ClientPluginRegistration>;
const productionEntries = [...registry];
const acceptsAnyPayload = (value: unknown): value is unknown => value !== undefined;

function pluginTab(label: string, id: string): TabView {
  return {
    label, number: 1, dotColor: '#5b9cff', group: 1, groupColor: '#5b9cff', busy: false,
    hasUnread: false, cwd: '/tmp', connections: [], schedule: [], bufferLines: [], cmdHistory: [],
    commandQueue: [], toolStepsExpanded: false, view: 'plugin', dock: 'left', title: label,
    plugin: { id, schemaVersion: 1, payload: { text: `${label} body` } },
  };
}

// Counts mounts per plugin id, so a test can tell a re-render from a remount — the property that
// keeps a docked video playing while another sidebar entry is showing.
function registerCountingPlugin(id: string, mounts: () => void) {
  const Plugin = ({ payload, capabilities }: {
    payload: unknown; capabilities: { active: boolean; dock: 'left' | 'right' | null };
  }) => {
    React.useEffect(() => { mounts(); }, []);
    return (
      <div
        data-testid={`${id}-body`}
        data-active={String(capabilities.active)}
        data-dock={String(capabilities.dock)}
      >
        {(payload as { text: string }).text}
      </div>
    );
  };
  registry.set(id, clientPlugin(1, async () => ({ default: Plugin, isPayload: acceptsAnyPayload })));
}

beforeEach(() => {
  registry.clear();
  clearClientPluginFailures();
});

afterEach(() => {
  registry.clear();
  for (const [id, entry] of productionEntries) registry.set(id, entry);
  clearClientPluginFailures();
  vi.restoreAllMocks();
});

describe('a plugin tab docked into a sidebar', () => {
  it('renders the plugin body in the sidebar', async () => {
    registerCountingPlugin('fixture', () => {});
    const client = { send: vi.fn() } as unknown as JanusClient;

    render(<Sidebar side="left" tabs={[pluginTab('fixture', 'fixture')]} client={client} />);

    await waitFor(() => { expect(screen.getByTestId('fixture-body')).toBeInTheDocument(); });
    expect(screen.getByTestId('fixture-body')).toHaveTextContent('fixture body');
  });

  it('keeps every docked plugin mounted, showing only the selected one', async () => {
    const first = vi.fn();
    const second = vi.fn();
    registerCountingPlugin('first', first);
    registerCountingPlugin('second', second);
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = [pluginTab('first', 'first'), pluginTab('second', 'second')];

    const { container } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    await waitFor(() => { expect(screen.getByTestId('second-body')).toBeInTheDocument(); });

    // Both bodies exist; the sidebar hides the one that is not selected rather than unmounting it.
    const frames = [...container.querySelectorAll<HTMLElement>('.sidebar-plugin')];
    expect(frames).toHaveLength(2);
    expect(frames.filter((frame) => frame.style.display === 'none')).toHaveLength(1);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('switches which docked plugin shows without remounting either', async () => {
    const first = vi.fn();
    const second = vi.fn();
    registerCountingPlugin('first', first);
    registerCountingPlugin('second', second);
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = [pluginTab('first', 'first'), pluginTab('second', 'second')];
    const { container } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    await waitFor(() => { expect(screen.getByTestId('first-body')).toBeInTheDocument(); });

    fireEvent.mouseDown(container.querySelectorAll('.tab')[1]);

    await waitFor(() => {
      expect(screen.getByTestId('second-body').closest('.sidebar-plugin')).toHaveStyle({ display: 'flex' });
    });
    expect(screen.getByTestId('first-body').closest('.sidebar-plugin')).toHaveStyle({ display: 'none' });
    expect(container.querySelectorAll('.sidebar-plugin')).toHaveLength(2);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('tells only the visible plugin that it is active', async () => {
    registerCountingPlugin('first', () => {});
    registerCountingPlugin('second', () => {});
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = [pluginTab('first', 'first'), pluginTab('second', 'second')];

    render(<Sidebar side="left" tabs={tabs} client={client} />);

    await waitFor(() => { expect(screen.getByTestId('second-body')).toBeInTheDocument(); });
    expect(screen.getByTestId('first-body')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('second-body')).toHaveAttribute('data-active', 'false');
  });

  // Placement is host-owned: a plugin that lays itself out for a narrow sidebar reads the side here
  // rather than measuring the frame the host renders around it.
  it('tells a docked plugin which sidebar it is in', async () => {
    registerCountingPlugin('fixture', () => {});
    const client = { send: vi.fn() } as unknown as JanusClient;

    render(<Sidebar side="left" tabs={[pluginTab('fixture', 'fixture')]} client={client} />);

    await waitFor(() => { expect(screen.getByTestId('fixture-body')).toBeInTheDocument(); });
    expect(screen.getByTestId('fixture-body')).toHaveAttribute('data-dock', 'left');
  });

  it('offers the host dock-cycle control above the plugin body', async () => {
    registerCountingPlugin('fixture', () => {});
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;

    render(<Sidebar side="left" tabs={[pluginTab('fixture', 'fixture')]} client={client} />);
    await waitFor(() => { expect(screen.getByTestId('fixture-body')).toBeInTheDocument(); });
    fireEvent.click(screen.getByRole('button', { name: /move to right sidebar/i }));

    expect(send).toHaveBeenCalledWith({ method: 'setDock', params: { index: 0, dock: 'right' } });
  });
});
