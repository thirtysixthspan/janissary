import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectionActivity, RecordConnectionRow } from '@shared/plugins/connections/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ConnectionTab } from './ConnectionTab';

function setup(record: RecordConnectionRow, impl?: (name: string, payload: unknown) => Promise<unknown>) {
  const intent = vi.fn(impl ?? (async () => null));
  const openLink = vi.fn();
  const capabilities = {
    resourceUrl: (value: string) => value,
    intent: async <Result,>(name: string, payload: unknown) => intent(name, payload) as Promise<Result>,
    copyText: vi.fn(), splitAction: null, active: true, dock: null, close: vi.fn(), reportFailure: vi.fn(),
    openLink,
  } as TabPluginClientCapabilities;
  return { intent, openLink, capabilities, view: render(<ConnectionTab record={record} capabilities={capabilities} />) };
}

function record(kind: 'acp' | 'agent' = 'acp', status: RecordConnectionRow['status'] = 'Running'): RecordConnectionRow {
  return { type: 'record', id: 'uuid', kind, title: 'Authoritative title', model: 'model-x', status,
    host: 'Local', ownerLabel: 'other-label', ownerName: 'Captured owner', startedAt: 0, updatedAt: 2, endedAt: 3,
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
  it('shows captured owner, started time, ordered labels and rendered answer', () => {
    setup(record());
    expect(screen.getByText('Captured owner')).toBeInTheDocument();
    expect(screen.getAllByText(new Date(0).toLocaleString(), { exact: false })).toHaveLength(1);
    expect(screen.getByText('answer', { exact: false })).toBeInTheDocument();
    expect([...document.querySelectorAll('.connections-activity-label')].map((el) => el.textContent))
      .toEqual(['message', 'plan', 'permission']);
    expect(screen.getByText('thought', { selector: 'summary' }).closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('tool', { selector: 'summary' }).closest('details')).toHaveAttribute('open');
  });

  it('pretty-prints an entry whose text is JSON and leaves plain text as it is', () => {
    const value = record();
    value.window!.blocks[0]!.entries = [
      { kind: 'tool', text: '{"query":"select 1","rows":[1]}', timestamp: 1 },
      { kind: 'tool', text: 'db query select 1', timestamp: 2 },
    ];
    setup(value);
    const json = document.querySelector('pre.connections-activity-json');
    expect(json?.textContent).toBe('{\n  "query": "select 1",\n  "rows": [\n    1\n  ]\n}');
    expect(document.querySelectorAll('pre')).toHaveLength(1);
    expect(screen.getByText('db query select 1').tagName).toBe('DIV');
  });

  it('keeps a tool entry the reader collapsed closed through a streamed update', () => {
    const value = record();
    const { view, capabilities } = setup(value);
    const details = screen.getByText('tool', { selector: 'summary' }).closest('details')!;
    details.open = false;
    const entries = value.window!.blocks[0]!.entries.map((entry) =>
      entry.kind === 'tool' ? { ...entry, text: 'tool output' } : entry);
    view.rerender(<ConnectionTab record={{ ...value, window: { ...value.window!,
      blocks: [{ ...value.window!.blocks[0]!, entries }] } }} capabilities={capabilities} />);
    expect(screen.getByText('tool output').closest('details')).toBe(details);
    expect(details).not.toHaveAttribute('open');
  });

  it('keeps expanded entries and block order when older blocks are prepended', () => {
    const value = record();
    value.window!.offset = 2;
    value.window!.totalBlocks = 3;
    value.window!.blocks[0]!.prompt = 'existing';
    const { view, capabilities } = setup(value);
    const thought = screen.getByText('thought', { selector: 'summary' });
    fireEvent.click(thought);
    const details = thought.closest('details');
    expect(details).toHaveAttribute('open');
    const older = ['oldest', 'older'].map((prompt, index) => ({
      prompt, startedAt: 10 + index,
      entries: [{ kind: 'message' as const, text: prompt, timestamp: 10 + index }],
    }));
    view.rerender(<ConnectionTab record={{ ...value, window: { ...value.window!, offset: 0, hasOlder: false,
      blocks: [...older, value.window!.blocks[0]!] } }} capabilities={capabilities} />);
    expect(details?.isConnected).toBe(true);
    expect(screen.getByText('thought', { selector: 'summary' }).closest('details')).toHaveAttribute('open');
    expect([...document.querySelectorAll('.connections-prompt')].map((element) => element.textContent))
      .toEqual(['oldest', 'older', 'existing']);
  });

  it('gates ACP actions by authoritative status and sends their intents', () => {
    const { intent } = setup(record());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close session' }));
    expect(intent).toHaveBeenCalledWith('cancel', { id: 'uuid' });
    expect(intent).toHaveBeenCalledWith('close-session', { id: 'uuid' });
  });

  it.each([
    ['Cancel', 'cancel', 'Only a running record can be cancelled.'],
    ['Close session', 'close-session', 'Only an open record can be closed.'],
  ] as const)('shows a refused %s action and leaves the record unchanged', async (label, intentName, message) => {
    const value = record();
    const before = structuredClone(value);
    const { intent } = setup(value, async () => { throw new Error(message); });
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message));
    expect(intent).toHaveBeenCalledWith(intentName, { id: 'uuid' });
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close session' })).toBeInTheDocument();
    expect(value).toEqual(before);
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

  it('routes answer links through openLink without navigating and leaves activity text alone', () => {
    const value = record();
    value.window!.blocks[0]!.answer = 'See [the docs](https://example.com/docs).';
    const { openLink } = setup(value);
    const linkClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    screen.getByRole('link', { name: 'the docs' }).dispatchEvent(linkClick);
    expect(linkClick.defaultPrevented).toBe(true);
    expect(openLink).toHaveBeenCalledOnce();
    expect(openLink).toHaveBeenCalledWith('https://example.com/docs');
    const activityClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    screen.getByText('message', { selector: '.connections-activity-text' }).dispatchEvent(activityClick);
    expect(activityClick.defaultPrevented).toBe(false);
    expect(openLink).toHaveBeenCalledOnce();
  });

  describe('metadata bar', () => {
    const bar = () => document.querySelector('.connections-record-header') as HTMLElement;
    const fields = () => [...bar().children].filter((element) => !element.classList.contains('plugin-actions'));
    const actions = () => [...bar().querySelectorAll(':scope > .plugin-actions > button')].map((button) => ({
      label: button.getAttribute('aria-label'),
      icon: button.querySelector('svg')?.dataset.icon,
      text: button.textContent,
    }));

    it('leads the tab with host, tab, id, name, model, state, and started time in order', () => {
      setup(record());
      expect(document.querySelector('.connections-record')?.firstElementChild).toBe(bar());
      expect(bar()).toHaveClass('plugin-meta');
      expect(fields().map((element) => element.textContent)).toEqual([
        'Local', 'Captured owner', 'uuid', 'acp:Captured owner', 'model-x', 'Running',
        `Started ${new Date(0).toLocaleString()}`,
      ]);
      expect(bar().querySelector('time')).toHaveAttribute('dateTime', new Date(0).toISOString());
    });

    it('names each field in its tooltip and keeps the record title in the name tooltip only', () => {
      setup(record());
      expect(fields().map((element) => element.getAttribute('title'))).toEqual([
        'Host: Local', 'Tab: Captured owner', 'Connection ID: uuid',
        'Connection Name: acp:Captured owner\nAuthoritative title', 'Model: model-x', 'Connection State: Running',
        `Started: ${new Date(0).toLocaleString()}`,
      ]);
      expect(screen.queryByText('Authoritative title')).toBeNull();
    });

    it('leaves out the ended time, run id, and task path', () => {
      const value = record('agent', 'Completed');
      value.endedAt = Date.UTC(2001, 1, 2, 3, 4, 5);
      setup(value);
      expect(bar()).not.toHaveTextContent(new Date(value.endedAt).toLocaleString());
      expect(bar()).not.toHaveTextContent('run-id');
      expect(bar()).not.toHaveTextContent('/task');
      expect(fields().map((element) => element.textContent)).toContain('agent:Captured owner');
    });

    it('floats a running ACP record\'s stop and close icons to the right edge', () => {
      setup(record());
      expect(bar().lastElementChild).toHaveClass('plugin-actions');
      expect(actions()).toEqual([
        { label: 'Cancel', icon: 'circle-stop', text: '' },
        { label: 'Close session', icon: 'circle-xmark', text: '' },
      ]);
    });

    it('offers only the close icon while an ACP record is idle', () => {
      setup(record('acp', 'Idle'));
      expect(actions()).toEqual([{ label: 'Close session', icon: 'circle-xmark', text: '' }]);
    });

    it('leads the icons with Focus tab while the owning tab is open and sends its intent', () => {
      const { intent } = setup({ ...record('acp', 'Closed'), focusTarget: 'other-label' });
      expect(actions()).toEqual([{ label: 'Focus tab', icon: 'location-crosshairs', text: '' }]);
      fireEvent.click(screen.getByRole('button', { name: 'Focus tab' }));
      expect(intent).toHaveBeenCalledWith('focus', { id: 'uuid' });
    });

    it('puts Focus tab before a running record\'s stop and close icons', () => {
      setup({ ...record(), focusTarget: 'other-label' });
      expect(actions().map((action) => action.label)).toEqual(['Focus tab', 'Cancel', 'Close session']);
    });

    it('offers no Focus tab without a focus target', () => {
      setup(record());
      expect(screen.queryByRole('button', { name: 'Focus tab' })).toBeNull();
    });

    it('shows a refused focus in the tab', async () => {
      setup({ ...record('agent', 'Completed'), focusTarget: 'other-label' }, async () => {
        throw new Error('The owning tab is no longer open.');
      });
      fireEvent.click(screen.getByRole('button', { name: 'Focus tab' }));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The owning tab is no longer open.'));
    });

    it('offers a running agent run only the stop icon, as Terminate', () => {
      const { intent } = setup(record('agent'));
      expect(actions()).toEqual([{ label: 'Terminate', icon: 'circle-stop', text: '' }]);
      fireEvent.click(screen.getByRole('button', { name: 'Terminate' }));
      expect(intent).toHaveBeenCalledWith('terminate', { id: 'uuid' });
    });
  });

  it('offers no Terminate for terminal agent statuses and renders activity text plainly', () => {
    const value = record('agent', 'Completed');
    value.window!.blocks[0]!.entries = [{ kind: 'message', text: '<b>plain</b>', timestamp: 1 } satisfies ConnectionActivity];
    setup(value);
    expect(screen.queryByRole('button', { name: 'Terminate' })).toBeNull();
    expect(screen.getByText('<b>plain</b>')).toBeInTheDocument();
  });
});
