import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectionActivity, RecordConnectionRow } from '@shared/plugins/connections/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ConnectionTab } from './ConnectionTab';

function setup(record: RecordConnectionRow, impl?: (name: string, payload: unknown) => Promise<unknown>) {
  const intent = vi.fn(impl ?? (async () => null));
  const capabilities = {
    resourceUrl: (value: string) => value,
    intent: async <Result,>(name: string, payload: unknown) => intent(name, payload) as Promise<Result>,
    copyText: vi.fn(), splitAction: null, active: true, dock: null, close: vi.fn(), reportFailure: vi.fn(),
  } as TabPluginClientCapabilities;
  return { intent, capabilities, view: render(<ConnectionTab record={record} capabilities={capabilities} />) };
}

function record(kind: 'acp' | 'agent' = 'acp', status: RecordConnectionRow['status'] = 'Running'): RecordConnectionRow {
  return { type: 'record', id: 'uuid', kind, title: 'Authoritative title', model: 'model-x', status,
    ownerLabel: 'other-label', ownerName: 'Captured owner', startedAt: 0, updatedAt: 2, endedAt: 3,
    runId: 'run-id', orderingTimestamp: 4,
    window: { id: 'uuid', source: kind === 'agent'
      ? { kind: 'agent', model: 'model-x', ownerLabel: 'other-label', ownerName: 'Captured owner', runId: 'run-id', taskPath: '/task' }
      : { kind: 'acp', model: 'model-x', ownerLabel: 'other-label', ownerName: 'Captured owner' },
      offset: 0, totalBlocks: 1, hasOlder: false, blocks: [{ prompt: 'prompt', startedAt: 1,
        entries: (['message', 'thought', 'tool', 'plan', 'permission'] as const).map((kind, timestamp) => ({ kind, text: kind, timestamp })),
        answer: '**answer**' }] },
  };
}

describe('ConnectionTab', () => {
  it('shows authoritative metadata, captured owner, timestamps, ordered labels and rendered answer', () => {
    setup(record());
    expect(screen.getByText('Authoritative title')).toBeInTheDocument();
    expect(screen.getByText('Captured owner')).toBeInTheDocument();
    expect(screen.getAllByText(new Date(0).toLocaleString(), { exact: false })).toHaveLength(2);
    expect(screen.getByText('answer', { exact: false })).toBeInTheDocument();
    expect([...document.querySelectorAll('.connections-activity-label')].map((el) => el.textContent))
      .toEqual(['message', 'plan', 'permission']);
    expect(screen.getByText('thought', { selector: 'summary' }).closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('tool', { selector: 'summary' }).closest('details')).not.toHaveAttribute('open');
  });

  it('gates ACP actions by authoritative status and sends their intents', () => {
    const { intent } = setup(record());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close session' }));
    expect(intent).toHaveBeenCalledWith('cancel', { id: 'uuid' });
    expect(intent).toHaveBeenCalledWith('close-session', { id: 'uuid' });
  });

  it('keeps closed records read-only and renders a missing window as loading', () => {
    const value = record('acp', 'Closed');
    value.window = undefined;
    setup(value);
    expect(screen.getByText('Loading connection history…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('disables Terminate while pending and clears it with the rejection message', async () => {
    const { intent } = setup(record('agent'), async () => { throw new Error('not allowed'); });
    const button = screen.getByRole('button', { name: 'Terminate' });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('not allowed'));
    expect(button).not.toBeDisabled();
    expect(intent).toHaveBeenCalledWith('terminate', { id: 'uuid' });
  });

  it('offers no Terminate for terminal agent statuses and renders activity text plainly', () => {
    const value = record('agent', 'Completed');
    value.window!.blocks[0]!.entries = [{ kind: 'message', text: '<b>plain</b>', timestamp: 1 } satisfies ConnectionActivity];
    setup(value);
    expect(screen.queryByRole('button', { name: 'Terminate' })).toBeNull();
    expect(screen.getByText('<b>plain</b>')).toBeInTheDocument();
  });
});
