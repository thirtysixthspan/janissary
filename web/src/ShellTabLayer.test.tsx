import { render, screen } from '@testing-library/react';
import React, { forwardRef, useImperativeHandle } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { ShellTabLayer } from './ShellTabLayer';
import type { JanusClient } from './ws';
import type { TabView } from '@shared/protocol';
import type { ShellTabHandle } from './ShellTab';

vi.mock('./ShellTab', () => ({
  ShellTab: forwardRef<ShellTabHandle, { ptyId: string }>(function ShellTab({ ptyId }, ref) {
    useImperativeHandle(ref, () => ({ focus: () => {} }), []);
    return <div data-ptyid={ptyId}>shell</div>;
  }),
}));

function fakeClient(): JanusClient {
  return { send: vi.fn() } as unknown as JanusClient;
}

function makeTab(overrides: Partial<TabView> & { activePty?: string } = {}): TabView {
  return {
    label: 'tab1',
    number: 1,
    dotColor: '#fff',
    group: 0,
    groupColor: '#000',
    busy: false,
    hasUnread: false,
    cwd: '/tmp',
    connections: [],
    schedule: [],
    bufferLines: [],
    cmdHistory: [],
    toolStepsExpanded: false,
    view: undefined,
    activePty: undefined,
    ...overrides,
  } as TabView;
}

describe('ShellTabLayer', () => {
  it('renders nothing when no tabs have activePty', () => {
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' })];
    const { container } = render(
      <ShellTabLayer tabs={tabs} activeLabel="a" client={fakeClient()} onHandle={() => {}} />,
    );
    expect(container.querySelector('.tab-body')).not.toBeInTheDocument();
  });

  it('renders a ShellTab for each tab with activePty and no view', () => {
    const tabs = [
      makeTab({ label: 'a', activePty: 'pty1', view: undefined }),
      makeTab({ label: 'b', activePty: 'pty2', view: undefined }),
    ];
    render(
      <ShellTabLayer tabs={tabs} activeLabel="a" client={fakeClient()} onHandle={() => {}} />,
    );
    const elements = screen.getAllByText('shell');
    expect(elements.length).toBe(2);
  });

  it('skips tabs that have a view set', () => {
    const tabs = [
      makeTab({ label: 'a', activePty: 'pty1', view: undefined }),
      makeTab({ label: 'b', activePty: 'pty2', view: 'harness' }),
    ];
    render(
      <ShellTabLayer tabs={tabs} activeLabel="a" client={fakeClient()} onHandle={() => {}} />,
    );
    const elements = screen.getAllByText('shell');
    expect(elements.length).toBe(1);
  });

  it('shows the active tab and hides inactive ones', () => {
    const tabs = [
      makeTab({ label: 'a', activePty: 'pty1', view: undefined, dotColor: '#111' }),
      makeTab({ label: 'b', activePty: 'pty2', view: undefined, dotColor: '#222' }),
    ];
    const { container } = render(
      <ShellTabLayer tabs={tabs} activeLabel="a" client={fakeClient()} onHandle={() => {}} />,
    );
    const bodies = [...container.querySelectorAll('.tab-body')];
    const activeStyle = bodies[0].getAttribute('style') ?? '';
    const inactiveStyle = bodies[1].getAttribute('style') ?? '';
    expect(activeStyle).toContain('display: flex');
    expect(inactiveStyle).toContain('display: none');
  });

  it('passes the client to ShellTab', () => {
    const client = fakeClient();
    const tabs = [makeTab({ label: 'a', activePty: 'pty1' })];
    render(
      <ShellTabLayer tabs={tabs} activeLabel="a" client={client} onHandle={() => {}} />,
    );
    expect(screen.getByText('shell')).toBeInTheDocument();
  });

  it('calls onHandle with ptyId when ShellTab mounts', () => {
    const handles = new Map<string, unknown>();
    const onHandle = vi.fn((ptyId: string, h: unknown) => { handles.set(ptyId, h); });
    const tabs = [makeTab({ label: 'a', activePty: 'my-pty' })];
    render(
      <ShellTabLayer tabs={tabs} activeLabel="a" client={fakeClient()} onHandle={onHandle} />,
    );
    expect(onHandle).toHaveBeenCalledWith('my-pty', expect.anything());
  });
});
