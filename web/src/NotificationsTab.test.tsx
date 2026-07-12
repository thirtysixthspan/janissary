import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { BufferLine } from '@shared/protocol';
import type { JanusClient } from './ws';
import { NotificationsTab } from './NotificationsTab';

// jsdom doesn't include ResizeObserver — Transcript observes its content element.
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

const lines: BufferLine[] = [{ type: 'output', text: "Agent 'deploy' finished" }];

describe('NotificationsTab', () => {
  it('does not show the "help" hint when there are no notifications yet', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    render(<NotificationsTab lines={[]} client={client} index={0} />);
    expect(screen.queryByText('Type "help" for available commands.')).toBeNull();
  });

  it('renders bufferLines as a transcript with no command bar', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<NotificationsTab lines={lines} client={client} index={0} />);
    expect(container.querySelector('.transcript')).not.toBeNull();
    expect(screen.getByText("Agent 'deploy' finished")).toBeTruthy();
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('renders lines newest-first, reversing the input order', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const twoLines: BufferLine[] = [
      { type: 'output', text: 'first event' },
      { type: 'output', text: 'second event' },
    ];
    const { container } = render(<NotificationsTab lines={twoLines} client={client} index={0} />);
    const rendered = [...container.querySelectorAll('.line')].map((el) => el.textContent);
    expect(rendered).toEqual(['second event', 'first event']);
  });

  it('shows no dock-cycle button when undocked', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    render(<NotificationsTab lines={lines} client={client} index={0} />);
    expect(screen.queryByTitle('Move to left sidebar')).toBeNull();
    expect(screen.queryByTitle('Move to right sidebar')).toBeNull();
  });

  it('when docked left, shows the dock-cycle button, which sends setDock to right', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<NotificationsTab lines={lines} client={client} index={2} dock="left" />);
    fireEvent.click(screen.getByTitle('Move to right sidebar'));
    expect(send).toHaveBeenCalledWith({ method: 'setDock', params: { index: 2, dock: 'right' } });
  });

  const renderFeed = () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<NotificationsTab lines={lines} client={client} index={0} />);
    return {
      wrapper: container.querySelector('.notifications-tab')! as HTMLElement,
      transcript: container.querySelector('.transcript')! as HTMLElement,
    };
  };

  it('ArrowDown scrolls the feed down', () => {
    const { wrapper, transcript } = renderFeed();
    transcript.scrollTop = 0;
    fireEvent.keyDown(wrapper, { key: 'ArrowDown' });
    expect(transcript.scrollTop).toBeGreaterThan(0);
  });

  it('ArrowUp scrolls the feed up', () => {
    const { wrapper, transcript } = renderFeed();
    transcript.scrollTop = 100;
    fireEvent.keyDown(wrapper, { key: 'ArrowUp' });
    expect(transcript.scrollTop).toBeLessThan(100);
  });

  it('PageDown scrolls by the container height', () => {
    const { wrapper, transcript } = renderFeed();
    Object.defineProperty(transcript, 'clientHeight', { value: 500, configurable: true });
    transcript.scrollTop = 0;
    fireEvent.keyDown(wrapper, { key: 'PageDown' });
    expect(transcript.scrollTop).toBe(500);
  });

  it('PageUp scrolls up by the container height', () => {
    const { wrapper, transcript } = renderFeed();
    Object.defineProperty(transcript, 'clientHeight', { value: 500, configurable: true });
    transcript.scrollTop = 800;
    fireEvent.keyDown(wrapper, { key: 'PageUp' });
    expect(transcript.scrollTop).toBe(300);
  });

  it('scroll keys are cancelled (preventDefault) so they do not also scroll the page', () => {
    const { wrapper } = renderFeed();
    expect(fireEvent.keyDown(wrapper, { key: 'ArrowDown' })).toBe(false);
    expect(fireEvent.keyDown(wrapper, { key: 'PageUp' })).toBe(false);
  });

  it('leaves scroll position and the event alone for an unrelated key', () => {
    const { wrapper, transcript } = renderFeed();
    transcript.scrollTop = 50;
    expect(fireEvent.keyDown(wrapper, { key: 'a' })).toBe(true);
    expect(transcript.scrollTop).toBe(50);
  });
});
