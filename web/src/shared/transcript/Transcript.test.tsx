import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BufferLine } from '@shared/protocol';
import { Transcript } from './Transcript';
import { transcriptIntents } from './transcript-intents';
import { ptyActions } from '../terminal/pty-actions';

vi.mock('../terminal/useXterm', () => ({
  useXterm: vi.fn(() => ({ focus: () => {}, selection: { view: null } })),
}));

// jsdom doesn't include ResizeObserver — Transcript observes its content element.
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

function fakeClient() {
  const send = vi.fn();
  const client = { send, attachPty: vi.fn(() => () => {}) };
  return { client, send, intents: transcriptIntents(send), ptyActions: ptyActions(client) };
}

function renderTranscript(lines: BufferLine[], actions = fakeClient()) {
  const scrollRef = React.createRef<HTMLDivElement>();
  return render(
    <Transcript
      lines={lines}
      intents={actions.intents}
      ptyActions={actions.ptyActions}
      onToggleCollapse={() => {}}
      onPromptClick={() => {}}
      scrollRef={scrollRef}
    />,
  );
}

describe('Transcript', () => {
  it('renders a terminal line as a terminal card, which the transcript wires to the client', () => {
    const actions = fakeClient();
    const line: BufferLine = {
      type: 'terminal',
      text: '',
      terminal: { ptyId: 'p1', program: 'npm start', status: 'running', exitCode: undefined },
    };
    const { container } = renderTranscript([line], actions);
    expect(container.querySelector('.terminal-card')).toBeInTheDocument();
    expect(screen.getByText(/npm start/)).toBeInTheDocument();
  });

  it('gives the terminal card the client, so its kill button still reaches the server', async () => {
    const actions = fakeClient();
    const line: BufferLine = {
      type: 'terminal',
      text: '',
      terminal: { ptyId: 'p1', program: 'npm start', status: 'running', exitCode: undefined },
    };
    renderTranscript([line], actions);
    await userEvent.click(screen.getByRole('button', { name: 'kill' }));
    expect(actions.send).toHaveBeenCalledWith({ method: 'ptyKill', params: { id: 'p1' } });
  });

  it('renders a non-terminal line through renderLine, with intents built from the client', async () => {
    const actions = fakeClient();
    const line: BufferLine = {
      type: 'message',
      text: 'Question from build',
      from: '8:32pm build',
      openTab: 'build',
    };
    renderTranscript([line], actions);
    await userEvent.click(screen.getByRole('button', { name: 'build' }));
    expect(actions.send).toHaveBeenCalledWith({ method: 'focusTab', params: { label: 'build' } });
  });

  it('renders a terminal line and an ordinary line side by side', () => {
    const actions = fakeClient();
    const lines: BufferLine[] = [
      { type: 'terminal', text: '', terminal: { ptyId: 'p1', program: 'npm start', status: 'running', exitCode: undefined } },
      { type: 'output', text: 'just plain text' },
    ];
    const { container } = renderTranscript(lines, actions);
    expect(container.querySelector('.terminal-card')).toBeInTheDocument();
    expect(screen.getByText('just plain text')).toBeInTheDocument();
  });

  it('shows the empty hint when there are no lines', () => {
    const { container } = renderTranscript([]);
    expect(container.querySelector('.empty-state')).toBeInTheDocument();
  });
});
