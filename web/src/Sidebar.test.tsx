import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { Sidebar } from './Sidebar';

// jsdom doesn't include ResizeObserver — the docked notifications view's Transcript observes its content.
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'files', number: 1, dotColor: '#5b9cff', group: 1, groupColor: '#5b9cff',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    ...overrides,
  };
}

describe('Sidebar', () => {
  it('renders nothing when no tab is docked to this side', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<Sidebar side="left" tabs={[makeTab()]} client={client} />);
    expect(container.querySelector('.sidebar')).toBeNull();
  });

  it('renders the docked tree for the matching side', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = [makeTab({ view: 'files', dock: 'left', files: { root: '/tmp/project', absoluteRoot: '/tmp/project', rows: [] } })];
    const { container, getByText } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    expect(container.querySelector('.sidebar-left')).not.toBeNull();
    expect(getByText('/tmp/project')).toBeTruthy();
  });

  it('ignores a tab docked to the other side', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = [makeTab({ view: 'files', dock: 'right', files: { root: '/tmp/project', absoluteRoot: '/tmp/project', rows: [] } })];
    const { container } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    expect(container.querySelector('.sidebar')).toBeNull();
  });

  it('drag clamps width to the minimum (180px) when dragged far past it', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = [makeTab({ view: 'files', dock: 'left', files: { root: '/tmp/project', absoluteRoot: '/tmp/project', rows: [] } })];
    const { container } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    const sidebar = container.querySelector('.sidebar-left') as HTMLElement;
    const divider = container.querySelector('.sidebar-resize')!;
    fireEvent.mouseDown(divider, { clientX: 280 });
    fireEvent.mouseMove(document, { clientX: -1000 });
    expect(sidebar.style.flex).toBe('0 0 180px');
  });

  it('stops resizing on mouseup', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = [makeTab({ view: 'files', dock: 'left', files: { root: '/tmp/project', absoluteRoot: '/tmp/project', rows: [] } })];
    const { container } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    const sidebar = container.querySelector('.sidebar-left') as HTMLElement;
    const divider = container.querySelector('.sidebar-resize')!;
    fireEvent.mouseDown(divider, { clientX: 280 });
    fireEvent.mouseUp(document);
    // mouseup removes listeners — subsequent moves are no-ops
    fireEvent.mouseMove(document, { clientX: 200 });
    fireEvent.mouseMove(document, { clientX: 100 });
    expect(sidebar.style.flex).toBe('0 0 280px');
  });

  it('sends closeTab when the close button is clicked', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const tabs = [makeTab({ view: 'files', dock: 'left', files: { root: '/tmp/project', absoluteRoot: '/tmp/project', rows: [] } })];
    const { container } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    const btn = container.querySelector('.tab-close')!;
    fireEvent.click(btn);
    expect(send).toHaveBeenCalledWith({ method: 'closeTab', params: { index: 0 } });
  });

  it('renders a docked notifications feed with its transcript body and a close button', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const tabs = [makeTab({
      label: 'notifications', title: 'notifications', view: 'notifications', dock: 'right',
      bufferLines: [{ type: 'output', text: 'a notification' }],
    })];
    const { container, getByText } = render(<Sidebar side="right" tabs={tabs} client={client} />);
    expect(getByText('a notification')).toBeTruthy();
    fireEvent.click(container.querySelector('.tab-close')!);
    expect(send).toHaveBeenCalledWith({ method: 'closeTab', params: { index: 0 } });
  });

  it('renders one tab-strip entry per docked tab when both are docked to the same side', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = [
      makeTab({ label: 'files', view: 'files', dock: 'left', files: { root: '/tmp/project', absoluteRoot: '/tmp/project', rows: [] } }),
      makeTab({ label: 'notifications', title: 'notifications', view: 'notifications', dock: 'left' }),
    ];
    const { container } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    expect(container.querySelectorAll(':scope .tabstrip .tab')).toHaveLength(2);
  });

  it('clicking the inactive switcher tab changes which content renders', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = [
      makeTab({ label: 'files', view: 'files', dock: 'left', files: { root: '/tmp/project', absoluteRoot: '/tmp/project', rows: [] } }),
      makeTab({
        label: 'notifications', title: 'notifications', view: 'notifications', dock: 'left',
        bufferLines: [{ type: 'output', text: 'a notification' }],
      }),
    ];
    const { getByText } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    expect(getByText('/tmp/project')).toBeTruthy();
    fireEvent.mouseDown(getByText('notifications'));
    expect(getByText('a notification')).toBeTruthy();
  });

  it("each entry's close button closes that entry's own tab", () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const tabs = [
      makeTab({ label: 'files', view: 'files', dock: 'left', files: { root: '/tmp/project', absoluteRoot: '/tmp/project', rows: [] } }),
      makeTab({ label: 'notifications', title: 'notifications', view: 'notifications', dock: 'left' }),
    ];
    const { container } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    const closes = container.querySelectorAll('.tab-close');
    fireEvent.click(closes[1]);
    expect(send).toHaveBeenCalledWith({ method: 'closeTab', params: { index: 1 } });
    fireEvent.click(closes[0]);
    expect(send).toHaveBeenCalledWith({ method: 'closeTab', params: { index: 0 } });
  });

  it('double-clicking the active sidebar tab opens a rename input and commits via renameTab', () => {
    const client = { send: vi.fn(), renameTab: vi.fn() } as unknown as JanusClient;
    const tabs = [
      makeTab({ label: 'files', view: 'files', dock: 'left', files: { root: '/tmp/project', absoluteRoot: '/tmp/project', rows: [] } }),
      makeTab({ label: 'notifications', title: 'notifications', view: 'notifications', dock: 'left' }),
    ];
    const { getByText, container } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    fireEvent.doubleClick(getByText('files'));
    const input = container.querySelector('.tab-rename-input') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: 'notes' } });
    fireEvent.blur(input);
    expect(client.renameTab).toHaveBeenCalledWith(0, 'notes');
  });

  it('sidebar tab labels no longer stretch to fill the strip (legacy flex label wrapper is gone)', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = [
      makeTab({ label: 'files', view: 'files', dock: 'left', files: { root: '/tmp/project', absoluteRoot: '/tmp/project', rows: [] } }),
      makeTab({ label: 'notifications', title: 'notifications', view: 'notifications', dock: 'left' }),
    ];
    const { container } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    expect(container.querySelector('.sidebar-tab-label')).toBeNull();
  });

  it('docking a second tab auto-switches the visible content to it', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const filesTab = makeTab({ label: 'files', view: 'files', dock: 'left', files: { root: '/tmp/project', absoluteRoot: '/tmp/project', rows: [] } });
    const { rerender, getByText, queryByText } = render(<Sidebar side="left" tabs={[filesTab]} client={client} />);
    expect(getByText('/tmp/project')).toBeTruthy();

    const notificationsTab = makeTab({
      label: 'notifications', title: 'notifications', view: 'notifications', dock: 'left',
      bufferLines: [{ type: 'output', text: 'a notification' }],
    });
    rerender(<Sidebar side="left" tabs={[filesTab, notificationsTab]} client={client} />);
    expect(getByText('a notification')).toBeTruthy();
    expect(queryByText('/tmp/project')).toBeNull();
  });

  it('drag clamps width to 50% of the viewport when dragged far past it', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = [makeTab({ view: 'files', dock: 'right', files: { root: '/tmp/project', absoluteRoot: '/tmp/project', rows: [] } })];
    const { container } = render(<Sidebar side="right" tabs={tabs} client={client} />);
    const sidebar = container.querySelector('.sidebar-right') as HTMLElement;
    const divider = container.querySelector('.sidebar-resize')!;
    fireEvent.mouseDown(divider, { clientX: 280 });
    fireEvent.mouseMove(document, { clientX: -100_000 }); // dragging left widens the right sidebar
    const maxWidth = globalThis.innerWidth * 0.5;
    expect(sidebar.style.flex).toBe(`0 0 ${maxWidth}px`);
  });
});
