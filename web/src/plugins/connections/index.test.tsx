import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectionsPayload } from '@shared/plugins/connections/shared';
import type { TabPluginClientCapabilities } from '../api';
import ConnectionsPlugin from './index';

vi.mock('./ConnectionList', () => ({ ConnectionList: ({ rows }: { rows: unknown[] }) => <div>list:{rows.length}</div> }));
vi.mock('./ConnectionTab', () => ({ ConnectionTab: ({ record }: { record: { title: string } }) => <div>record:{record.title}</div> }));

const capabilities = {} as TabPluginClientCapabilities;

describe('connections entry routing', () => {
  it('keeps the list payload on the list surface', () => {
    const payload: ConnectionsPayload = { kind: 'list', rows: [] };
    render(<ConnectionsPlugin payload={payload} capabilities={capabilities} />);
    expect(screen.getByText('list:0')).toBeInTheDocument();
  });

  it('routes a record payload to ConnectionTab', () => {
    const payload: ConnectionsPayload = { kind: 'connection', record: {
      type: 'record', id: 'id', kind: 'acp', title: 'Session', model: 'model', status: 'Idle',
      host: 'Local', ownerLabel: 'owner', ownerName: 'Captured owner', orderingTimestamp: 1, startedAt: 1, updatedAt: 2,
    } };
    render(<ConnectionsPlugin payload={payload} capabilities={capabilities} />);
    expect(screen.getByText('record:Session')).toBeInTheDocument();
  });
});
