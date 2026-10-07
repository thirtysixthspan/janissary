import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeNotificationEvent } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { NativeNotifications } from './native-notifications';

const event: NativeNotificationEvent = {
  t: 'native-notification', tab: 'build', from: 'Build agent', message: 'Question',
  category: 'warning', desktop: true, volume: 0.4,
};

let clicked: () => void;
let notifications: Array<{ title: string; body: string; close: ReturnType<typeof vi.fn> }>;
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
    constructor(title: string, options: NotificationOptions) {
      notifications.push({ title, body: options.body ?? '', close: this.close });
    }
    addEventListener(_type: string, handler: () => void) { clicked = handler; }
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
    service.show(event, 'janus');
    expect(notifications).toEqual([expect.objectContaining({ title: 'Janissary', body: 'Build agent: Question' })]);
    expect(audio).toEqual([expect.objectContaining({ url: '/sounds/warning.mp3?token=test', volume: 0.4 })]);
    expect(audio[0]?.play).toHaveBeenCalledOnce();
    service.dispose();
    expect(audio[0]?.pause).toHaveBeenCalledOnce();
  });

  it('clicking the banner focuses the owning tab', () => {
    const focus = vi.spyOn(globalThis, 'focus').mockImplementation(() => {});
    new NativeNotifications(client).show({ ...event, volume: 0 }, 'janus');
    clicked();
    expect(focus).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ method: 'focusTab', params: { label: 'build' } });
    expect(notifications[0]?.close).toHaveBeenCalledOnce();
  });

  it('suppresses only while the owning tab and app window are both focused', () => {
    const service = new NativeNotifications(client);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    service.show(event, 'build');
    expect(notifications).toHaveLength(0);
    expect(audio).toHaveLength(0);
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    service.show(event, 'build');
    expect(notifications).toHaveLength(1);
    expect(audio).toHaveLength(1);
  });

  it('honors independent channel switches and throttles only bell playback', () => {
    const service = new NativeNotifications(client);
    service.show({ ...event, desktop: false }, 'janus');
    service.show(event, 'janus');
    expect(notifications).toHaveLength(1);
    expect(audio).toHaveLength(1);
    vi.spyOn(Date, 'now').mockReturnValue(3000);
    service.show({ ...event, volume: 0 }, 'janus');
    expect(audio).toHaveLength(1);
    service.show(event, 'janus');
    expect(audio).toHaveLength(2);
  });

  it('does not request permission or break when desktop or audio APIs refuse', () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() });
    vi.stubGlobal('Audio', class { constructor() { throw new Error('blocked'); } });
    expect(() => new NativeNotifications(client).show(event, 'janus')).not.toThrow();
    expect(notifications).toHaveLength(0);
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });
});
