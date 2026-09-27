import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { AppReportingSection } from './AppReportingSection';
import type { ReportingEntry } from './ReportingSection';
import type { JanusClient } from './ws';
import type { TabView } from '@shared/protocol';

// The reporting section's strip is a drag surface over the *reporting rows*, while the reorder RPC
// wants *tab indices*. Those are different numbers whenever a reporting tab is not the nth tab, so
// the adapter maps one to the other — and that two-line mapping was the only thing in this file with
// no test. Getting it wrong moves a different tab than the one dragged.

function tab(label: string): TabView {
  return {
    label, view: 'monitor', number: 1, dotColor: '#fff', group: 0, groupColor: '#000',
    monitor: { name: 'writer', persona: 'p', targets: [], contextBytes: 0, suggestions: [] },
    connections: [], schedule: [], bufferLines: [], cmdHistory: [], toolStepsExpanded: false,
  } as unknown as TabView;
}

// Deliberately not in tab order: row 0 is tab 4, row 1 is tab 1, row 2 is tab 7. A reorder that sent
// the row positions instead of these indices would still look plausible in a test built from 0,1,2.
function entry(label: string, index: number): ReportingEntry {
  return { tab: tab(label), index };
}

const ENTRIES = [entry('first', 4), entry('second', 1), entry('third', 7)];

function section(overrides: Partial<React.ComponentProps<typeof AppReportingSection>> = {}) {
  const client = { send: vi.fn(), renameTab: vi.fn() } as unknown as JanusClient;
  const props = {
    entries: ENTRIES, client, onClose: vi.fn(), heightPct: 20, onHeightPctChange: vi.fn(),
    ...overrides,
  };
  const view = render(React.createElement(AppReportingSection, props));
  // jsdom measures every element as zero, so a drag would have no geometry to work with. Each tab is
  // laid out 100px apart, in strip order, so a drag lands on a real neighbour.
  const tabs = [...view.container.querySelectorAll<HTMLElement>('.tab')];
  for (const [slot, tab] of tabs.entries()) {
    const left = slot * 100;
    vi.spyOn(tab, 'getBoundingClientRect').mockReturnValue({
      x: left, y: 0, left, top: 0, right: left + 100, bottom: 30, width: 100, height: 30,
      toJSON: () => ({}),
    } as DOMRect);
  }
  return { client, ...view };
}

function dragTab(container: HTMLElement, from: number, to: number): void {
  const tab = container.querySelectorAll<HTMLElement>('.tab')[from];
  expect(tab).toBeTruthy();
  fireEvent.mouseDown(tab!, { button: 0, clientX: from * 100 + 50, clientY: 15 });
  fireEvent.mouseMove(document, { clientX: to * 100 + 50, clientY: 15 });
  fireEvent.mouseUp(document, { clientX: to * 100 + 50, clientY: 15 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppReportingSection', () => {
  it('renders a row per reporting tab', () => {
    const { container } = section();

    expect(container.querySelectorAll('.tab').length).toBe(3);
  });

  it('reorders by the tab index each row stands for, not by its position in the strip', () => {
    const { client, container } = section();

    dragTab(container, 0, 1);

    expect(client.send).toHaveBeenCalledWith({
      method: 'reorderTabTo', params: { from: 4, to: 1 },
    });
  });

  it('reorders downwards with the indices the other way round', () => {
    const { client, container } = section();

    dragTab(container, 2, 0);

    expect(client.send).toHaveBeenCalledWith({
      method: 'reorderTabTo', params: { from: 7, to: 4 },
    });
  });

  it('sends nothing when a tab is dropped where it started', () => {
    const { client, container } = section();

    dragTab(container, 1, 1);

    expect(client.send).not.toHaveBeenCalled();
  });
});
