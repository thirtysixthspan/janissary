import { afterEach, describe, expect, it, vi } from 'vitest';
import { startClientPageLifecycle } from './client-page-lifecycle';

type TestClient = { dispose: ReturnType<typeof vi.fn> };

let stop: (() => void) | undefined;

afterEach(() => {
  stop?.();
  stop = undefined;
});

function pageTransition(type: 'pagehide' | 'pageshow', persisted: boolean): PageTransitionEvent {
  const event = new Event(type) as PageTransitionEvent;
  Object.defineProperty(event, 'persisted', { value: persisted });
  return event;
}

describe('client page lifecycle', () => {
  it('responds to online and visible events and removes every listener on teardown', () => {
    const client = { dispose: vi.fn(), reconnect: vi.fn() };
    const create = vi.fn(() => client);
    stop = startClientPageLifecycle(create, vi.fn());
    globalThis.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(client.reconnect).toHaveBeenCalledTimes(document.visibilityState === 'visible' ? 2 : 1);
    stop();
    client.reconnect.mockClear();
    globalThis.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    globalThis.dispatchEvent(pageTransition('pagehide', true));
    globalThis.dispatchEvent(pageTransition('pageshow', true));
    expect(client.reconnect).not.toHaveBeenCalled();
    expect(client.dispose).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
  });
  it('creates and renders the initial client', () => {
    const client: TestClient = { dispose: vi.fn() };
    const createClient = vi.fn(() => client);
    const render = vi.fn();

    stop = startClientPageLifecycle(createClient, render);

    expect(createClient).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledWith(client);
  });

  it('replaces the disposed client when the page returns from bfcache', () => {
    const first: TestClient = { dispose: vi.fn() };
    const second: TestClient = { dispose: vi.fn() };
    const createClient = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const render = vi.fn();

    stop = startClientPageLifecycle(createClient, render);
    globalThis.dispatchEvent(pageTransition('pagehide', true));
    globalThis.dispatchEvent(pageTransition('pageshow', true));

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith(second);
  });

  it('does not replace the client for an ordinary pageshow', () => {
    const client: TestClient = { dispose: vi.fn() };
    const createClient = vi.fn(() => client);
    const render = vi.fn();

    stop = startClientPageLifecycle(createClient, render);
    globalThis.dispatchEvent(pageTransition('pageshow', false));

    expect(createClient).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });
});
