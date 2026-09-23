import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JanusClient } from '../ws';
import type { RpcCall } from '@shared/protocol';
import { ToastStack } from './ToastStack';
import { TOAST_FADE_MS, TOAST_VISIBLE_MS } from './toast-queue';

type ToastEvent = { from: string; message: string; color?: string };

function makeClient() {
  const toastListeners = new Set<(event: ToastEvent) => void>();
  const clearListeners = new Set<() => void>();
  const sent: RpcCall[] = [];
  const client = {
    onToast: (l: (event: ToastEvent) => void) => { toastListeners.add(l); return () => toastListeners.delete(l); },
    onToastClear: (l: () => void) => { clearListeners.add(l); return () => clearListeners.delete(l); },
    send: (call: RpcCall) => { sent.push(call); },
  } as unknown as JanusClient;
  return {
    client,
    sent,
    toast: (event: ToastEvent) => { act(() => { for (const l of toastListeners) l(event); }); },
    clear: () => { act(() => { for (const l of clearListeners) l(); }); },
  };
}

describe('ToastStack', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); });
  afterEach(() => { vi.useRealTimers(); });

  const advance = (ms: number) => { act(() => { vi.advanceTimersByTime(ms); }); };

  it('renders nothing until a toast arrives', () => {
    const fixture = makeClient();
    const { container } = render(<ToastStack client={fixture.client} />);
    expect(container.querySelector('.toast-stack')).toBeNull();
  });

  it('renders the dot, the originating tab, and the message', () => {
    const fixture = makeClient();
    render(<ToastStack client={fixture.client} />);
    fixture.toast({ from: 'janus', message: 'deploy finished', color: '#abc' });

    const toast = screen.getByRole('button');
    expect((toast.querySelector('.dot') as HTMLElement).style.color).toBe('rgb(170, 187, 204)');
    expect(toast.querySelector('.toast-from')!.textContent).toBe('janus:');
    expect(toast.querySelector('.toast-message')!.textContent).toBe('deploy finished');
  });

  it('fades on schedule and then disappears', () => {
    const fixture = makeClient();
    render(<ToastStack client={fixture.client} />);
    fixture.toast({ from: 'janus', message: 'one' });

    advance(TOAST_VISIBLE_MS);
    expect(screen.getByRole('button').className).toContain('toast--fading');
    advance(TOAST_FADE_MS);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('holds while hovered and resumes with the remaining time after', () => {
    const fixture = makeClient();
    render(<ToastStack client={fixture.client} />);
    fixture.toast({ from: 'janus', message: 'one' });

    advance(3000);
    fireEvent.mouseEnter(screen.getByRole('button'));
    advance(60_000);
    expect(screen.getByRole('button').className).not.toContain('toast--fading');

    fireEvent.mouseLeave(screen.getByRole('button'));
    advance(1000);
    expect(screen.getByRole('button').className).toContain('toast--fading');
  });

  it('clears the stack immediately on the clear event', () => {
    const fixture = makeClient();
    render(<ToastStack client={fixture.client} />);
    fixture.toast({ from: 'janus', message: 'one' });
    fixture.toast({ from: 'build', message: 'two' });
    expect(screen.getAllByRole('button')).toHaveLength(2);

    fixture.clear();
    expect(screen.queryByRole('button')).toBeNull();
  });

  // A click is a UI gesture asking the server to make the feed visible; the server answers with the
  // clear event, so the component does not empty the stack itself.
  it('sends the reveal RPC on click', () => {
    const fixture = makeClient();
    render(<ToastStack client={fixture.client} />);
    fixture.toast({ from: 'janus', message: 'one' });

    fireEvent.click(screen.getByRole('button'));
    expect(fixture.sent).toEqual([{ method: 'revealNotifications', params: {} }]);
  });

  it('clears its timers on unmount', () => {
    const fixture = makeClient();
    const { unmount } = render(<ToastStack client={fixture.client} />);
    fixture.toast({ from: 'janus', message: 'one' });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
