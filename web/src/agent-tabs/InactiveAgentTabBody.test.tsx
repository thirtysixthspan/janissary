import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { InactiveAgentTabBody } from './InactiveAgentTabBody';

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  disconnect() {}
});

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'agent2', number: 2, dotColor: '#abcdef', group: 1, groupColor: '#123456',
    busy: true, hasUnread: false, cwd: '/tmp/project', flags: ['workspaced'],
    connections: [], schedule: [], bufferLines: [], cmdHistory: ['previous'],
    commandQueue: [], toolStepsExpanded: false,
    ...overrides,
  };
}

function setup(tab: TabView = makeTab()) {
  const send = vi.fn();
  const request = vi.fn().mockResolvedValue({ newInput: '', newCursor: 0, matches: [] });
  const onSplit = vi.fn();
  const client = { send, request } as unknown as JanusClient;
  const result = render(<InactiveAgentTabBody tab={tab} client={client} onSplit={onSplit} />);
  return { ...result, send, onSplit, request };
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
    fireEvent.click(screen.getByTitle('Open file navigator in this workspace'));
    fireEvent.click(screen.getByTitle('New agent in this workspace'));
    fireEvent.click(screen.getByRole('button', { name: 'Open transcript' }));
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    expect(send).toHaveBeenCalledWith({ method: 'openFileNavigatorFor', params: { label: 'agent2' } });
    expect(send).toHaveBeenCalledWith({ method: 'launchAgentFor', params: { label: 'agent2' } });
    expect(send).toHaveBeenCalledWith({ method: 'openTranscriptFor', params: { label: 'agent2' } });
    expect(onSplit).toHaveBeenCalledOnce();
  });

  it('focuses the command input on mouse-up when nothing is selected', () => {
    const { container } = setup();
    const input = screen.getByRole('textbox');
    input.blur();
    expect(input).not.toHaveFocus();
    fireEvent.mouseUp(container.querySelector('.tab-body')!);
    expect(input).toHaveFocus();
  });

  it('does not steal focus on mouse-up when text is selected', () => {
    const { container } = setup();
    const input = screen.getByRole('textbox');
    input.blur();
    vi.spyOn(globalThis, 'getSelection').mockReturnValue({ toString: () => 'selected text' } as Selection);
    fireEvent.mouseUp(container.querySelector('.tab-body')!);
    expect(input).not.toHaveFocus();
    vi.restoreAllMocks();
  });

  it('collapses/expands and re-runs a prompt via the transcript, and requests completions', async () => {
    const tab = makeTab({
      bufferLines: [
        { type: 'prompt', text: 'echo one', acp: true },
        { type: 'prompt', text: 'echo two' },
      ],
    });
    const { container, send, request } = setup(tab);
    fireEvent.click(container.querySelector('.line.prompt.acp')!);
    expect(send).toHaveBeenCalledWith({ method: 'toggleCollapse', params: {} });

    fireEvent.doubleClick(container.querySelector('.prompt-text')!);
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'echo two' } });

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'fil' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(request).toHaveBeenCalledWith({ method: 'complete', params: { text: 'fil', cursor: 3 } });
  });

  it('opens the ACP transcript for a connection row carrying an acpRef', () => {
    const tab = makeTab({ connections: [{ text: 'acp:opencode', kind: 'acp', acpRef: { scope: 'tab', label: 'agent2' } }] });
    const { container, send } = setup(tab);
    fireEvent.click(container.querySelector('.panel-row-transcript')!);
    expect(send).toHaveBeenCalledWith({ method: 'openAcpTranscript', params: { acpRef: { scope: 'tab', label: 'agent2' } } });
  });
});
