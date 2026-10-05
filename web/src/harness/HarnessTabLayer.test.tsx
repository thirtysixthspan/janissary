import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { HarnessTabView } from '../shared/tab/view-guards';
import type { HarnessTabHandle } from '../shared/tab/handles';
import type { JanusClient } from '../ws';
import { HarnessTabLayer } from './HarnessTabLayer';

vi.mock('./HarnessTab', () => {
  const { forwardRef, useImperativeHandle, createElement } = React;
  return {
    HarnessTab: forwardRef((_props, ref) => {
      useImperativeHandle(ref, () => ({ focus: () => {} }), []);
      return createElement('div', { 'data-testid': 'harness' });
    }),
  };
});

const schedule = [{ id: 's1', spec: 'every 5m', next: 'soon', recurring: true }];

function makeHarnessTab(label: string): HarnessTabView {
  return {
    label, view: 'harness', dotColor: '#f00', groupColor: '#ccc',
    harness: { ptyId: `pty-${label}`, name: 'claude' },
    connections: [], schedule, bufferLines: [], cmdHistory: [],
  } as unknown as HarnessTabView;
}

function makeAgentTab(label: string): TabView {
  return {
    label, dotColor: '#0f0', groupColor: '#ccc',
    connections: [], schedule: [], bufferLines: [], cmdHistory: [],
  } as unknown as TabView;
}

function layer(t: HarnessTabView, current: TabView) {
  const harnessHandles = { current: new Map<string, HarnessTabHandle>() };
  return (
    <HarnessTabLayer
      t={t} current={current} client={{} as JanusClient} harnessHandles={harnessHandles} visible index={0}
    />
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HarnessTabLayer status windows', () => {
  it('auto-shows the schedule window of the current harness tab', () => {
    const harness = makeHarnessTab('claude');
    render(layer(harness, harness));
    expect(screen.getByText('schedule')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(5300); });
    expect(screen.queryByText('schedule')).toBeNull();
  });

  // A harness shown in the other split pane stays mounted and visible while the focused pane's tab
  // changes; its schedule window must not pop up each time that happens.
  it('does not auto-show a harness tab that is not current when the current tab changes', () => {
    const harness = makeHarnessTab('claude');
    const { rerender } = render(layer(harness, makeAgentTab('agent1')));
    expect(screen.queryByText('schedule')).toBeNull();

    rerender(layer(harness, makeAgentTab('agent2')));
    expect(screen.queryByText('schedule')).toBeNull();
  });
});
