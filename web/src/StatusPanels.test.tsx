import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import type { TabView } from '@shared/protocol';
import { StatusPanels } from './StatusPanels';

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
    cmdHistory: [],
    toolStepsExpanded: false,
    ...overrides,
  };
}

describe('StatusPanels', () => {
  it('renders an ssh connection row with a conn-ssh class', () => {
    const tab = makeTab({ connections: [{ text: 'ssh:devbox', kind: 'ssh' }] });
    const { container } = render(<StatusPanels tab={tab} />);
    const row = container.querySelector('.panel-row.conn-ssh');
    expect(row).toBeInTheDocument();
    expect(row?.textContent).toBe('ssh:devbox');
  });

  it('drops the connections list when scheduleOnly is set', () => {
    const tab = makeTab({
      connections: [{ text: 'ssh:devbox', kind: 'ssh' }],
      schedule: [{ id: 's1', spec: 'every 1h', next: 'in 1h', recurring: true }],
    });
    const { container } = render(<StatusPanels tab={tab} scheduleOnly />);
    expect(container.querySelector('.panel-row.conn-ssh')).not.toBeInTheDocument();
    expect(container.querySelector('.panel-title')?.textContent).toBe('schedule');
  });
});
