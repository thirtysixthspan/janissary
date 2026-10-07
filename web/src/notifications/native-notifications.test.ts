import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeNotificationEvent } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { NativeNotifications } from './native-notifications';
import type { AlertPlacement } from './alert-placement';

const centre = (active: string): AlertPlacement => ({ isVisible: (label) => label === active, reveal: () => false });

const event: NativeNotificationEvent = {
  t: 'native-notification', tab: 'build', from: 'Build agent', message: 'Question',
  category: 'warning', desktop: true, volume: 0.4,
};

let clicked: () => void;
type Handler = () => void;
interface FakeNotification {
  title: string;
  body: string;
  close: ReturnType<typeof vi.fn>;
  handlers: Map<string, Set<Handler>>;
  emit(type: string): void;
}
let notifications: FakeNotification[];
let audio: Array<{ url: string; volume: number; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }>;
const send = vi.fn();
const client = { send, resourceUrl: (url: string) => `${url}?token=test` } as unknown as JanusClient;

beforeEach(() => {
  notifications = [];
  audio = [];
  send.mockClear();
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  vi.spyOn(Date, 'now').mockReturnValue(2000);
  vi.stubGlobal('Notification', class {
    static permission = 'granted';
    close = vi.fn();
    handlers = new Map<string, Set<Handler>>();
    title: string;
    body: string;
    constructor(title: string, options: NotificationOptions) {
      this.title = title;
      this.body = options.body ?? '';
      notifications.push(this as unknown as FakeNotification);
    }
    addEventListener(type: string, handler: Handler) {
      this.handlers.set(type, (this.handlers.get(type) ?? new Set()).add(handler));
      if (type === 'click') clicked = handler;
    }
    removeEventListener(type: string, handler: Handler) { this.handlers.get(type)?.delete(handler); }
    emit(type: string) {
      const registered = this.handlers.get(type) ?? new Set<Handler>();
      for (const handler of registered) handler();
    }
  });
  vi.stubGlobal('Audio', class {
    volume = 1;
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();
    constructor(public url: string) { audio.push(this); }
    addEventListener() {}
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('NativeNotifications', () => {
  it('shows the OS banner and plays the selected MP3 at the server-provided volume', () => {
    const service = new NativeNotifications(client);
    service.show(event, centre('janus'));
    expect(notifications).toEqual([expect.objectContaining({ title: 'Janissary', body: 'Build agent: Question' })]);
    expect(audio).toEqual([expect.objectContaining({ url: '/sounds/warning.mp3?token=test', volume: 0.4 })]);
    expect(audio[0]?.play).toHaveBeenCalledOnce();
    service.dispose();
    expect(audio[0]?.pause).toHaveBeenCalledOnce();
  });

  it('clicking the banner focuses the owning tab', () => {
    const focus = vi.spyOn(globalThis, 'focus').mockImplementation(() => {});
    new NativeNotifications(client).show({ ...event, volume: 0 }, centre('janus'));
    clicked();
    expect(focus).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ method: 'focusTab', params: { label: 'build' } });
    expect(notifications[0]?.close).toHaveBeenCalledOnce();
  });

  it('clicking a docked tab banner reveals it locally without sending focusTab', () => {
    const focus = vi.spyOn(globalThis, 'focus').mockImplementation(() => {});
    const reveal = vi.fn(() => true);
    new NativeNotifications(client).show({ ...event, volume: 0 }, { isVisible: () => false, reveal });
    clicked();
    expect(focus).toHaveBeenCalledOnce();
    expect(reveal).toHaveBeenCalledWith('build');
    expect(send).not.toHaveBeenCalled();
    expect(notifications[0]?.close).toHaveBeenCalledOnce();
  });

  it('suppresses a docked tab while its sidebar entry is selected in a focused window', () => {
    const service = new NativeNotifications(client);
    const docked: AlertPlacement = { isVisible: (label) => label === 'build', reveal: () => true };
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    service.show(event, docked);
    expect(notifications).toHaveLength(0);
    expect(audio).toHaveLength(0);
  });

  it('suppresses only while the owning tab and app window are both focused', () => {
    const service = new NativeNotifications(client);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    service.show(event, centre('build'));
    expect(notifications).toHaveLength(0);
    expect(audio).toHaveLength(0);
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    service.show(event, centre('build'));
    expect(notifications).toHaveLength(1);
    expect(audio).toHaveLength(1);
  });

  it('honors independent channel switches and throttles only bell playback', () => {
    const service = new NativeNotifications(client);
    service.show({ ...event, desktop: false }, centre('janus'));
    service.show(event, centre('janus'));
    expect(notifications).toHaveLength(1);
    expect(audio).toHaveLength(1);
    vi.spyOn(Date, 'now').mockReturnValue(3000);
    service.show({ ...event, volume: 0 }, centre('janus'));
    expect(audio).toHaveLength(1);
    service.show(event, centre('janus'));
    expect(audio).toHaveLength(2);
  });

  it('ignores a late click on a banner retained after the client is disposed', () => {
    const focus = vi.spyOn(globalThis, 'focus').mockImplementation(() => {});
    const reveal = vi.fn(() => false);
    const service = new NativeNotifications(client);
    service.show({ ...event, volume: 0 }, { isVisible: () => false, reveal });
    const retained = clicked;
    service.dispose();
    retained();
    expect(focus).not.toHaveBeenCalled();
    expect(reveal).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('closes and releases only the banners the disposed service owns', () => {
    const old = new NativeNotifications(client);
    const current = new NativeNotifications(client);
    old.show({ ...event, volume: 0 }, centre('janus'));
    old.show({ ...event, volume: 0 }, centre('janus'));
    current.show({ ...event, volume: 0 }, centre('janus'));
    old.dispose();
    expect(notifications.map((n) => n.close.mock.calls.length)).toEqual([1, 1, 0]);
    expect(notifications.map((n) => [...n.handlers.values()].reduce((sum, set) => sum + set.size, 0))).toEqual([0, 0, 2]);
    old.dispose();
    expect(notifications[0]?.close).toHaveBeenCalledOnce();
  });

  it('releases a banner the OS closed independently', () => {
    const service = new NativeNotifications(client);
    service.show({ ...event, volume: 0 }, centre('janus'));
    service.show({ ...event, volume: 0 }, centre('janus'));
    notifications[0]?.emit('close');
    expect(notifications[0]?.handlers.get('click')?.size).toBe(0);
    service.dispose();
    expect(notifications[0]?.close).not.toHaveBeenCalled();
    expect(notifications[1]?.close).toHaveBeenCalledOnce();
  });

  it('releases a clicked banner and tolerates close failing during disposal', () => {
    vi.spyOn(globalThis, 'focus').mockImplementation(() => {});
    const service = new NativeNotifications(client);
    service.show({ ...event, volume: 0 }, centre('janus'));
    service.show({ ...event, volume: 0 }, centre('janus'));
    notifications[0]?.emit('click');
    notifications[1]?.close.mockImplementation(() => { throw new Error('gone'); });
    expect(() => service.dispose()).not.toThrow();
    expect(notifications[0]?.close).toHaveBeenCalledOnce();
  });

  it('shows nothing once disposed', () => {
    const service = new NativeNotifications(client);
    service.dispose();
    service.show(event, centre('janus'));
    expect(notifications).toHaveLength(0);
    expect(audio).toHaveLength(0);
  });

  it('does not request permission or break when desktop or audio APIs refuse', () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() });
    vi.stubGlobal('Audio', class { constructor() { throw new Error('blocked'); } });
    expect(() => new NativeNotifications(client).show(event, centre('janus'))).not.toThrow();
    expect(notifications).toHaveLength(0);
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });
});
