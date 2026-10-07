import { act, render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { Sidebar } from './Sidebar';
import { sidebarSelectionFor } from './sidebar-selection-coordinator';

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function makeTab(overrides: Partial<TabView>): TabView {
  return {
    label: 'files', number: 1, dotColor: '#5b9cff', group: 1, groupColor: '#5b9cff',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    ...overrides,
  };
}

const tabs = [
  makeTab({ label: 'files', view: 'files', dock: 'left', files: { root: '/tmp/project', absoluteRoot: '/tmp/project', rows: [] } }),
  makeTab({
    label: 'notifications', title: 'notifications', view: 'notifications', dock: 'left',
    bufferLines: [{ type: 'output', text: 'a notification' }],
  }),
];

describe('Sidebar alert selection', () => {
  it('publishes its selected entry to the per-client coordinator', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { unmount } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    const coordinator = sidebarSelectionFor(client);
    expect(coordinator.isSelected('files')).toBe(true);
    expect(coordinator.isSelected('notifications')).toBe(false);
    unmount();
    expect(coordinator.isSelected('files')).toBe(false);
  });

  it('selects a docked entry on request without sending an undocking RPC', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const { getByText } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    const coordinator = sidebarSelectionFor(client);
    let selected = false;
    act(() => { selected = coordinator.select('notifications'); });
    expect(selected).toBe(true);
    expect(getByText('a notification')).toBeTruthy();
    expect(coordinator.isSelected('notifications')).toBe(true);
    expect(coordinator.select('janus')).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
