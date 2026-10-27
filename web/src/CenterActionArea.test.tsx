import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './shared/ws/ws';
import { CenterActionArea, DEFAULT_SPLIT_PCT } from './CenterActionArea';

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
    splitPct: DEFAULT_SPLIT_PCT, setSplitPct: vi.fn(),
    tabNameMaxLength: 16, activeTabNameMaxLength: 50,
    onFocusCommandBar: vi.fn(), onFocusEditor: vi.fn(), windowFocused: true,
    renderBody: (entry: { tab: TabView }, focused: boolean) => (
      <button type="button">{`${entry.tab.label}-${focused ? 'focused' : 'visible'}`}</button>
    ),
    persistentLayers: null,
  };
  return { ...render(<CenterActionArea {...properties} />), properties, send };
}

function mockTabRects(container: HTMLElement): void {
  for (const [index, element] of [...container.querySelectorAll<HTMLElement>('.tab')].entries()) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      x: index * 100, y: 0, left: index * 100, top: 0,
      right: index * 100 + 80, bottom: 30, width: 80, height: 30,
      toJSON: vi.fn(),
    });
  }
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

  it('maps a cross-pane strip drop to the dragged tab server index', () => {
    const tabs = [tab('excluded'), tab('left'), tab('right', 'right')];
    const send = vi.fn();
    const client = { send, renameTab: vi.fn() } as unknown as JanusClient;
    const entries = tabs.slice(1).map((item, offset) => ({ tab: item, index: offset + 1 }));
    const { container } = render(<CenterActionArea
      entries={entries} tabs={tabs} activeTab={1} secondaryTab={2} client={client}
      splitPct={DEFAULT_SPLIT_PCT} setSplitPct={vi.fn()}
      closeTab={vi.fn()} tabNameMaxLength={16} activeTabNameMaxLength={50}
      onFocusCommandBar={vi.fn()} onFocusEditor={vi.fn()} windowFocused
      renderBody={() => null} persistentLayers={null}
    />);
    mockTabRects(container);
    fireEvent.mouseDown(screen.getByText('left'), { clientX: 40 });
    fireEvent.mouseMove(document, { clientX: 140 });
    fireEvent.mouseUp(screen.getByText('right'));
    expect(send).toHaveBeenCalledWith({
      method: 'moveTabToOtherPane', params: { index: 1 },
    });
  });

  it('collapses to one strip when the secondary selection disappears', () => {
    const { rerender, properties } = setup();
    rerender(<CenterActionArea {...properties} secondaryTab={undefined} />);
    expect(document.querySelector('.center-strip-right')).toBeNull();
    expect(document.querySelector('.center-split-resize')).toBeNull();
  });

  it('renders the controlled split percent', () => {
    const { container, rerender, properties } = setup();
    const area = container.querySelector<HTMLElement>('.center-action-area')!;
    expect(area.style.getPropertyValue('--center-left-pct')).toBe(`${DEFAULT_SPLIT_PCT}%`);

    rerender(<CenterActionArea {...properties} splitPct={62} />);

    expect(area.style.getPropertyValue('--center-left-pct')).toBe('62%');
  });

  it('clamps divider dragging to the 15–85 percent band before reporting it', () => {
    const { container, properties } = setup();
    const eventTarget = globalThis as unknown as Window;
    const divider = container.querySelector<HTMLElement>('.center-split-resize')!;
    fireEvent.mouseDown(divider, { clientX: 500 });
    fireEvent.mouseMove(eventTarget, { clientX: 0 });
    expect(properties.setSplitPct).toHaveBeenCalledWith(15);
    fireEvent.mouseMove(eventTarget, { clientX: globalThis.innerWidth });
    expect(properties.setSplitPct).toHaveBeenCalledWith(85);
    fireEvent.mouseUp(eventTarget);
  });
});
