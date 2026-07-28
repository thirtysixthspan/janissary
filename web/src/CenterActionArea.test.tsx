import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { CenterActionArea } from './CenterActionArea';

function tab(label: string, pane?: 'right'): TabView {
  return {
    label, pane, number: 1, dotColor: '#fff', group: 1, groupColor: '#fff',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
  };
}

function setup(secondaryTab: number | undefined = 2) {
  const tabs = [tab('left-one'), tab('left-two'), tab('right-one', 'right')];
  const send = vi.fn();
  const client = { send, renameTab: vi.fn() } as unknown as JanusClient;
  const properties = {
    entries: tabs.map((item, index) => ({ tab: item, index })),
    tabs, activeTab: 1, secondaryTab, client, closeTab: vi.fn(),
    tabNameMaxLength: 16, activeTabNameMaxLength: 50,
    onFocusCommandBar: vi.fn(), onFocusEditor: vi.fn(), windowFocused: true,
    renderBody: (entry: { tab: TabView }, focused: boolean) => (
      <button type="button">{`${entry.tab.label}-${focused ? 'focused' : 'visible'}`}</button>
    ),
    persistentLayers: null,
  };
  return { ...render(<CenterActionArea {...properties} />), properties, send };
}

describe('CenterActionArea', () => {
  it('renders a filtered strip and selected body for each pane', () => {
    setup();
    expect([...document.querySelectorAll('.tab')].map((element) => element.textContent)).toEqual([
      expect.stringContaining('left-one'),
      expect.stringContaining('left-two'),
      expect.stringContaining('right-one'),
    ]);
    expect(screen.getByText('left-two-focused')).toBeInTheDocument();
    expect(screen.getByText('right-one-visible')).toBeInTheDocument();
  });

  it('maps a pane-local strip click to the full server index', () => {
    const { send } = setup();
    fireEvent.mouseDown(screen.getByText('left-one'));
    expect(send).toHaveBeenCalledWith({ method: 'setActiveTab', params: { index: 0 } });
  });

  it('focuses the other pane during capture before its descendant action', () => {
    const { send } = setup();
    fireEvent.pointerDown(screen.getByText('right-one-visible'));
    expect(send).toHaveBeenCalledWith({ method: 'setActiveTab', params: { index: 2 } });
  });

  it('collapses to one strip when the secondary selection disappears', () => {
    const { rerender, properties } = setup();
    rerender(<CenterActionArea {...properties} secondaryTab={undefined} />);
    expect(document.querySelector('.center-strip-right')).toBeNull();
    expect(document.querySelector('.center-split-resize')).toBeNull();
  });

  it('clamps divider dragging to the 15–85 percent band', () => {
    const { container } = setup();
    const eventTarget = globalThis as unknown as Window;
    const area = container.querySelector<HTMLElement>('.center-action-area')!;
    const divider = container.querySelector<HTMLElement>('.center-split-resize')!;
    fireEvent.mouseDown(divider, { clientX: 500 });
    fireEvent.mouseMove(eventTarget, { clientX: 0 });
    expect(area.style.getPropertyValue('--center-left-pct')).toBe('15%');
    fireEvent.mouseMove(eventTarget, { clientX: globalThis.innerWidth });
    expect(area.style.getPropertyValue('--center-left-pct')).toBe('85%');
    fireEvent.mouseUp(eventTarget);
  });
});
