import { fireEvent, render, screen } from '@testing-library/react';
import React, { forwardRef, useImperativeHandle } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { ShellTabLayer } from './ShellTabLayer';
import type { JanusClient } from './ws';
import type { TabView } from '@shared/protocol';
import type { ShellTabHandle } from './shared/tab/handles';

vi.mock('./ShellTab', () => ({
  ShellTab: forwardRef<ShellTabHandle, { ptyId: string; remote?: TabView['remote']; onSplit?: () => void }>(
    function ShellTab({ ptyId, remote, onSplit }, ref) {
      useImperativeHandle(ref, () => ({ focus: () => {} }), []);
      return (
        <button type="button" data-ptyid={ptyId} data-remote={remote?.address} onClick={onSplit}>
          shell
        </button>
      );
    },
  ),
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

  it('shows both selected pane shells in their pane columns', () => {
    const tabs = [
      makeTab({ label: 'a', activePty: 'pty1', dotColor: '#111111' }),
      makeTab({ label: 'b', activePty: 'pty2', pane: 'right', dotColor: '#222222' }),
    ];
    const { container } = render(
      <ShellTabLayer
        tabs={tabs} activeLabel="a" visibleLabels={['a', 'b']}
        client={fakeClient()} onHandle={() => {}}
      />,
    );
    const bodies = [...container.querySelectorAll<HTMLElement>('.tab-body')];
    expect(bodies.map((body) => body.style.display)).toEqual(['flex', 'flex']);
    expect(bodies.map((body) => body.style.gridColumn)).toEqual(['1', '2']);
    expect(bodies.map((body) => body.style.borderLeft)).toEqual([
      '4px solid rgb(17, 17, 17)',
      '4px solid var(--muted)',
    ]);
  });

  it('passes the client to ShellTab', () => {
    const client = fakeClient();
    const tabs = [makeTab({ label: 'a', activePty: 'pty1' })];
    render(
      <ShellTabLayer tabs={tabs} activeLabel="a" client={client} onHandle={() => {}} />,
    );
    expect(screen.getByText('shell')).toBeInTheDocument();
  });

  it('passes the tab remote to ShellTab', () => {
    const remote = { address: 'admin@devbox:/srv/proj', host: 'devbox' };
    const tabs = [makeTab({ label: 'a', activePty: 'pty1', remote })];
    render(
      <ShellTabLayer tabs={tabs} activeLabel="a" client={fakeClient()} onHandle={() => {}} />,
    );
    expect(screen.getByText('shell')).toHaveAttribute('data-remote', remote.address);
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

  // The chord is bound to the layer's own index, not to the tab's pty id or a stale zero: splitting
  // the wrong shell is the failure, and nothing in the rendered output would show it.
  it('splits the shell at its own index in the layer', () => {
    const onSplit = vi.fn();
    const tabs = [makeTab({ label: 'a', activePty: 'pty1' }), makeTab({ label: 'b', activePty: 'pty2' })];
    render(
      <ShellTabLayer tabs={tabs} activeLabel="a" client={fakeClient()} onHandle={() => {}} onSplit={onSplit} />,
    );

    fireEvent.click(screen.getAllByText('shell')[1]!);

    expect(onSplit).toHaveBeenCalledWith(1);
  });

  it('offers no split when the caller passes no handler', () => {
    const tabs = [makeTab({ label: 'a', activePty: 'pty1' })];
    render(
      <ShellTabLayer tabs={tabs} activeLabel="a" client={fakeClient()} onHandle={() => {}} />,
    );

    expect(() => fireEvent.click(screen.getByText('shell'))).not.toThrow();
  });
});
