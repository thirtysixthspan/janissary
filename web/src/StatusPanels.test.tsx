import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import { StatusPanels } from './StatusPanels';
import type { StatusWindowHandlers } from './useStatusWindows';

function makeTab(overrides: Partial<TabView> = {}): TabView {
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
    cmdHistory: [], commandQueue: [],
    toolStepsExpanded: false,
    ...overrides,
  };
}

function windowState(overrides: Partial<StatusWindowHandlers> = {}): StatusWindowHandlers {
  return {
    visible: true,
    opacity: 1,
    onButtonEnter: () => {},
    onButtonLeave: () => {},
    onButtonClick: () => {},
    onWindowEnter: () => {},
    onWindowLeave: () => {},
    ...overrides,
  };
}

describe('StatusPanels', () => {
  it('renders an ssh connection row with a conn-ssh class when the window is visible', () => {
    const tab = makeTab({ connections: [{ text: 'ssh:devbox', kind: 'ssh' }] });
    const { container } = render(<StatusPanels tab={tab} connections={windowState()} schedule={windowState()} />);
    const row = container.querySelector('.panel-row.conn-ssh');
    expect(row).toBeInTheDocument();
    expect(row?.textContent).toBe('ssh:devbox');
  });

  it('drops the connections list when scheduleOnly is set', () => {
    const tab = makeTab({
      connections: [{ text: 'ssh:devbox', kind: 'ssh' }],
      schedule: [{ id: 's1', spec: 'every 1h', next: 'in 1h', recurring: true }],
    });
    const { container } = render(<StatusPanels tab={tab} scheduleOnly connections={windowState()} schedule={windowState()} />);
    expect(container.querySelector('.panel-row.conn-ssh')).not.toBeInTheDocument();
    expect(container.querySelector('.panel-title')?.textContent).toBe('schedule');
  });

  it('renders a non-empty window only when the hook marks it visible', () => {
    const tab = makeTab({ connections: [{ text: 'ssh:devbox', kind: 'ssh' }] });
    const { container, rerender } = render(
      <StatusPanels tab={tab} connections={windowState({ visible: false })} schedule={windowState()} />,
    );
    expect(container.querySelector('.status-panels')).not.toBeInTheDocument();

    rerender(<StatusPanels tab={tab} connections={windowState({ visible: true })} schedule={windowState()} />);
    expect(container.querySelector('.status-panels')).toBeInTheDocument();
  });

  it('applies the fading opacity to the panel style', () => {
    const tab = makeTab({ connections: [{ text: 'ssh:devbox', kind: 'ssh' }] });
    const { container } = render(<StatusPanels tab={tab} connections={windowState({ opacity: 0 })} schedule={windowState()} />);
    const panel = container.querySelector('.panel');
    expect(panel).toHaveStyle({ opacity: '0' });
  });

  it('still renders nothing for an empty window even when marked visible', () => {
    const tab = makeTab();
    const { container } = render(<StatusPanels tab={tab} connections={windowState()} schedule={windowState()} />);
    expect(container.querySelector('.status-panels')).not.toBeInTheDocument();
  });

  it('wires the window hover handlers only when interactive', () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const tab = makeTab({ connections: [{ text: 'ssh:devbox', kind: 'ssh' }] });
    const { container } = render(
      <StatusPanels
        tab={tab}
        connections={windowState({ onWindowEnter: onEnter, onWindowLeave: onLeave })}
        schedule={windowState()}
        interactive
      />,
    );
    const panel = container.querySelector('.panel');
    expect(panel).not.toBeNull();
    fireEvent.mouseEnter(panel!);
    expect(onEnter).toHaveBeenCalledTimes(1);
    fireEvent.mouseLeave(panel!);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('renders a close control on a row when onCloseRow is supplied and calls it with that row', () => {
    const onCloseRow = vi.fn();
    const tab = makeTab({ connections: [{ text: 'reviewer (acp)', kind: 'acp' }] });
    const { container } = render(
      <StatusPanels tab={tab} connections={windowState()} schedule={windowState()} onCloseRow={onCloseRow} />,
    );
    const close = container.querySelector('.panel-row-close');
    expect(close).toBeInTheDocument();
    fireEvent.click(close!);
    expect(onCloseRow).toHaveBeenCalledWith({ text: 'reviewer (acp)', kind: 'acp' }, 0);
  });

  it('renders no close control when onCloseRow is omitted', () => {
    const tab = makeTab({ connections: [{ text: 'ssh:devbox', kind: 'ssh' }] });
    const { container } = render(<StatusPanels tab={tab} connections={windowState()} schedule={windowState()} />);
    expect(container.querySelector('.panel-row-close')).not.toBeInTheDocument();
  });
});
