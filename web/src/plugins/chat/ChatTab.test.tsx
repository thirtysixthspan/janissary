import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatTabPayload } from '@shared/plugins/chat/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ChatTab } from './ChatTab';

function capabilities() {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
  const value: TabPluginClientCapabilities = {
    resourceUrl: (reference) => reference,
    intent: async <Result,>(name: string, payload: unknown) => intent(name, payload) as Promise<Result>,
    splitAction: <button type="button">Split</button>,
    active: true,
    dock: null,
    close: vi.fn(),
    reportFailure: vi.fn(),
  };
  return { intent, value };
}

function payload(overrides: Partial<ChatTabPayload['conversation']> = {}): ChatTabPayload {
  const opencode = { harness: 'opencode' as const, model: 'google/gemini' };
  return {
    kind: 'conversation',
    conversation: {
      id: 'first', title: 'First chat', pair: opencode, turns: [], hasOlder: false, ...overrides,
    },
    models: [
      { harness: 'claude', model: 'claude-sonnet' },
      opencode,
    ],
  };
}

function turn(query: string, response: string, streaming?: true) {
  return {
    query,
    response,
    streaming,
    pair: { harness: 'opencode' as const, model: 'google/gemini' },
  };
}

function stubScroll(element: HTMLElement, scrollHeight: number, scrollTop = 0) {
  Object.defineProperties(element, {
    scrollHeight: { value: scrollHeight, writable: true, configurable: true },
    scrollTop: { value: scrollTop, writable: true, configurable: true },
  });
}

describe('ChatTab', () => {
  it('renders sanitized Markdown, streaming text, and failures in place', () => {
    const { value } = capabilities();
    const { container } = render(<ChatTab
      payload={payload({ turns: [
        {
          query: 'markdown', response: '**safe**<script>bad()</script>',
          pair: { harness: 'opencode', model: 'google/gemini' },
        },
        {
          query: 'stream', response: 'partial', streaming: true,
          pair: { harness: 'opencode', model: 'google/gemini' },
        },
        {
          query: 'failure', response: '', error: 'agent failed',
          pair: { harness: 'opencode', model: 'google/gemini' },
        },
      ] })}
      capabilities={value}
    />);
    expect(container.querySelector('strong')).toHaveTextContent('safe');
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('partial')).toBeInTheDocument();
    expect(screen.getByText('agent failed')).toHaveClass('chat-response', 'failed');
  });

  it('scrolls to the bottom when a new user query is rendered', () => {
    const { value } = capabilities();
    const rendered = render(<ChatTab payload={payload()} capabilities={value} />);
    const viewport = rendered.container.querySelector('.chat-turns') as HTMLElement;
    stubScroll(viewport, 800);
    rendered.rerender(<ChatTab
      payload={payload({ turns: [turn('new query', '', true)] })}
      capabilities={value}
    />);
    expect(viewport.scrollTop).toBe(800);
  });

  it('follows a growing streamed response to its new bottom', () => {
    const { value } = capabilities();
    const rendered = render(<ChatTab
      payload={payload({ turns: [turn('question', '', true)] })}
      capabilities={value}
    />);
    const viewport = rendered.container.querySelector('.chat-turns') as HTMLElement;
    stubScroll(viewport, 800);
    Object.defineProperty(viewport, 'scrollHeight', {
      value: 1200, writable: true, configurable: true,
    });
    rendered.rerender(<ChatTab
      payload={payload({ turns: [turn('question', 'partial answer', true)] })}
      capabilities={value}
    />);
    expect(viewport.scrollTop).toBe(1200);
  });

  it('preserves the viewport when older turns are prepended', () => {
    const { value } = capabilities();
    const latest = turn('latest question', 'latest answer');
    const rendered = render(<ChatTab
      payload={payload({ turns: [latest], hasOlder: true })}
      capabilities={value}
    />);
    const viewport = rendered.container.querySelector('.chat-turns') as HTMLElement;
    stubScroll(viewport, 1000, 120);
    rendered.rerender(<ChatTab
      payload={payload({
        turns: [turn('older question', 'older answer'), latest],
        hasOlder: false,
      })}
      capabilities={value}
    />);
    expect(viewport.scrollTop).toBe(120);
  });

  it('groups catalogued models and emits a selection', () => {
    const { intent, value } = capabilities();
    render(<ChatTab payload={payload()} capabilities={value} />);
    expect(screen.getByRole('group', { name: 'claude' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'opencode' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'claude:claude-sonnet' } });
    expect(intent).toHaveBeenCalledWith('select-model', {
      harness: 'claude', model: 'claude-sonnet',
    });
  });

  it('opens workspace tools and disables them after deletion', () => {
    const { intent, value } = capabilities();
    const rendered = render(<ChatTab payload={payload()} capabilities={value} />);
    const files = screen.getByTitle('Open file navigator in this workspace');
    const agent = screen.getByTitle('New agent in this workspace');
    fireEvent.click(files);
    fireEvent.click(agent);
    expect(intent).toHaveBeenNthCalledWith(1, 'open-files', {});
    expect(intent).toHaveBeenNthCalledWith(2, 'launch-agent', {});

    rendered.rerender(<ChatTab payload={payload({ deleted: true })} capabilities={value} />);
    expect(files).toBeDisabled();
    expect(agent).toBeDisabled();
  });

  it('sends the composer text', () => {
    const { intent, value } = capabilities();
    render(<ChatTab payload={payload()} capabilities={value} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(intent).toHaveBeenCalledWith('send', { query: 'Hello' });
  });

  it('cancels a stream with Escape while active', () => {
    const { intent, value } = capabilities();
    render(<ChatTab payload={payload({ turns: [{
      query: 'long', response: 'partial', streaming: true,
      pair: { harness: 'opencode', model: 'google/gemini' },
    }] })} capabilities={value} />);
    fireEvent.keyDown(globalThis.window, { key: 'Escape' });
    expect(intent).toHaveBeenCalledWith('cancel', {});
  });

  it('loads older turns at the top only while older turns remain', () => {
    const first = capabilities();
    const rendered = render(<ChatTab payload={payload({ hasOlder: true })} capabilities={first.value} />);
    fireEvent.scroll(rendered.container.querySelector('.chat-turns')!, { target: { scrollTop: 0 } });
    expect(first.intent).toHaveBeenCalledWith('load-older', {});
    rendered.unmount();
    const last = capabilities();
    const complete = render(<ChatTab payload={payload({ hasOlder: false })} capabilities={last.value} />);
    fireEvent.scroll(complete.container.querySelector('.chat-turns')!, { target: { scrollTop: 0 } });
    expect(last.intent).not.toHaveBeenCalled();
  });
});
