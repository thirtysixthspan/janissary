import { describe, expect, it, vi } from 'vitest';
import { AcpPromptControl } from './prompt-control.js';

const handlers = () => ({ onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() });

describe('provider turn admission and drain', () => {
  it('does not publish a successful terminal barrier when its cancellation write fails', async () => {
    const control = new AcpPromptControl();
    const h = handlers();
    const turn = control.admit(h)!;
    const notification = Promise.withResolvers<void>();
    const pending = control.cancel(() => notification.promise);
    control.end(turn, 'cancelled');
    notification.reject(new Error('write failed'));
    await expect(pending).rejects.toThrow('write failed');
    expect(h.onEnd).not.toHaveBeenCalled();
    expect(control.current).toBe(turn);
    control.release('cancellation failed');
    expect(h.onError).toHaveBeenCalledWith('cancellation failed');
  });
  it('keeps a drained provider turn reserved until its cancellation write completes', async () => {
    const control = new AcpPromptControl();
    const h = handlers();
    const turn = control.admit(h)!;
    const notification = Promise.withResolvers<void>();
    const pending = control.cancel(() => notification.promise);
    control.end(turn, 'cancelled');

    expect(h.onEnd).not.toHaveBeenCalled();
    expect(control.current).toBe(turn);
    const next = handlers();
    expect(control.admit(next)).toBeUndefined();
    expect(next.onError).toHaveBeenCalledWith('ACP: a prompt is already running.');

    notification.resolve();
    await pending;
    expect(h.onEnd).toHaveBeenCalledExactlyOnceWith('cancelled');
    expect(control.current).toBeUndefined();
  });
  it('does not publish a terminal callback when cancellation fails after provider drain', async () => {
    const control = new AcpPromptControl();
    const h = handlers();
    const turn = control.admit(h)!;
    const notification = Promise.withResolvers<void>();
    const pending = control.cancel(() => notification.promise);
    control.end(turn, 'cancelled');
    notification.reject(new Error('write failed'));

    await expect(pending).rejects.toThrow('write failed');
    expect(h.onEnd).not.toHaveBeenCalled();
    expect(control.current).toBe(turn);
    control.release('cancellation failed');
  });
  it('releases a cancellation even if the notification write never finishes', async () => {
    const control = new AcpPromptControl();
    control.admit(handlers());
    const pending = control.cancel(() => new Promise<void>(() => {}));
    control.release();
    await expect(pending).resolves.toBeUndefined();
  });
  it('refuses overlap without replacing the active handlers', () => {
    const control = new AcpPromptControl();
    const first = handlers();
    const second = handlers();
    const turn = control.admit(first)!;
    expect(control.admit(second)).toBeUndefined();
    expect(second.onError).toHaveBeenCalledWith('ACP: a prompt is already running.');
    control.end(turn, 'end_turn');
    expect(first.onEnd).toHaveBeenCalledOnce();
  });

  it.each(['notification', 'provider'])('waits for both boundaries when %s finishes first', async (first) => {
    const control = new AcpPromptControl();
    const h = handlers();
    const turn = control.admit(h)!;
    const sent = Promise.withResolvers<void>();
    const send = vi.fn(() => sent.promise);
    const cancellation = control.cancel(send);
    expect(control.cancel(send)).toBe(cancellation);
    expect(turn.cancelled).toBe(true);
    if (first === 'notification') { sent.resolve(); await Promise.resolve(); }
    else control.end(turn, 'cancelled');
    expect(h.onEnd).not.toHaveBeenCalled();
    if (first === 'notification') control.end(turn, 'cancelled');
    else sent.resolve();
    await cancellation;
    expect(control.current).toBeUndefined();
    expect(h.onEnd).toHaveBeenCalledExactlyOnceWith('cancelled');
    expect(send).toHaveBeenCalledOnce();
  });

  it('releases before a terminal callback synchronously admits its successor', () => {
    const control = new AcpPromptControl();
    const next = handlers();
    const first = handlers();
    first.onEnd.mockImplementation(() => { control.admit(next); });
    const turn = control.admit(first)!;
    control.end(turn, 'end_turn');
    control.error(turn, 'late error');
    expect(control.current?.handlers).toBe(next);
    expect(first.onError).not.toHaveBeenCalled();
  });

  it('releases a cancellation waiter on close and ignores late terminal callbacks', async () => {
    const control = new AcpPromptControl();
    const h = handlers();
    const turn = control.admit(h)!;
    const pending = control.cancel(async () => {});
    control.release();
    await pending;
    control.end(turn, 'cancelled');
    expect(h.onError).toHaveBeenCalledExactlyOnceWith('ACP session closed.');
    expect(h.onEnd).not.toHaveBeenCalled();
  });

  it('does not send an idle cancel and propagates notification failure', async () => {
    const control = new AcpPromptControl();
    const send = vi.fn(async () => { throw new Error('write failed'); });
    await control.cancel(send);
    expect(send).not.toHaveBeenCalled();
    control.admit(handlers());
    await expect(control.cancel(send)).rejects.toThrow('write failed');
    control.release();
  });
});
