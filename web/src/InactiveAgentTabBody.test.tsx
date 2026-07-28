import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { InactiveAgentTabBody } from './InactiveAgentTabBody';

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  disconnect() {}
});

function makeTab(): TabView {
  return {
    label: 'agent2', number: 2, dotColor: '#abcdef', group: 1, groupColor: '#123456',
    busy: true, hasUnread: false, cwd: '/tmp/project', flags: ['workspaced'],
    connections: [], schedule: [], bufferLines: [], cmdHistory: ['previous'],
    commandQueue: [], toolStepsExpanded: false,
  };
}

function setup() {
  const send = vi.fn();
  const request = vi.fn().mockResolvedValue({ newInput: '', newCursor: 0, matches: [] });
  const onSplit = vi.fn();
  const client = { send, request } as unknown as JanusClient;
  const result = render(<InactiveAgentTabBody tab={makeTab()} client={client} onSplit={onSplit} />);
  return { ...result, send, onSplit };
}

describe('InactiveAgentTabBody', () => {
  it('keeps a non-autofocused command line in the visible pane and submits commands', () => {
    const { container, send } = setup();
    expect(container.querySelector<HTMLElement>('.tab-body')?.style.borderLeft).toBe('4px solid var(--muted)');
    const input = screen.getByRole('textbox');
    expect(input).not.toHaveFocus();
    fireEvent.change(input, { target: { value: 'echo hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'echo hello' } });
  });

  it('shows the same agent metadata actions and targets the visible tab', () => {
    const { send, onSplit } = setup();
    fireEvent.click(screen.getByTitle('Open file navigator here'));
    fireEvent.click(screen.getByTitle('New agent here'));
    fireEvent.click(screen.getByRole('button', { name: 'Open transcript' }));
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    expect(send).toHaveBeenCalledWith({ method: 'openFileNavigatorFor', params: { label: 'agent2' } });
    expect(send).toHaveBeenCalledWith({ method: 'launchAgentFor', params: { label: 'agent2' } });
    expect(send).toHaveBeenCalledWith({ method: 'openTranscriptFor', params: { label: 'agent2' } });
    expect(onSplit).toHaveBeenCalledOnce();
  });
});
