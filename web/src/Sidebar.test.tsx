import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { Sidebar } from './Sidebar';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'files', number: 1, dotColor: '#5b9cff', group: 1, groupColor: '#5b9cff',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], toolStepsExpanded: false,
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
    const tabs = [makeTab({ view: 'files', dock: 'left', files: { root: '/tmp/project', rows: [] } })];
    const { container, getByText } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    expect(container.querySelector('.sidebar-left')).not.toBeNull();
    expect(getByText('/tmp/project')).toBeTruthy();
  });

  it('ignores a tab docked to the other side', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = [makeTab({ view: 'files', dock: 'right', files: { root: '/tmp/project', rows: [] } })];
    const { container } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    expect(container.querySelector('.sidebar')).toBeNull();
  });

  it('drag clamps width to the minimum (180px) when dragged far past it', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = [makeTab({ view: 'files', dock: 'left', files: { root: '/tmp/project', rows: [] } })];
    const { container } = render(<Sidebar side="left" tabs={tabs} client={client} />);
    const sidebar = container.querySelector('.sidebar-left') as HTMLElement;
    const divider = container.querySelector('.sidebar-resize')!;
    fireEvent.mouseDown(divider, { clientX: 280 });
    fireEvent.mouseMove(document, { clientX: -1000 });
    expect(sidebar.style.flex).toBe('0 0 180px');
  });

  it('drag clamps width to 50% of the viewport when dragged far past it', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const tabs = [makeTab({ view: 'files', dock: 'right', files: { root: '/tmp/project', rows: [] } })];
    const { container } = render(<Sidebar side="right" tabs={tabs} client={client} />);
    const sidebar = container.querySelector('.sidebar-right') as HTMLElement;
    const divider = container.querySelector('.sidebar-resize')!;
    fireEvent.mouseDown(divider, { clientX: 280 });
    fireEvent.mouseMove(document, { clientX: -100_000 }); // dragging left widens the right sidebar
    const maxWidth = globalThis.innerWidth * 0.5;
    expect(sidebar.style.flex).toBe(`0 0 ${maxWidth}px`);
  });
});
