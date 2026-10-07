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

  it('does not request permission or break when desktop or audio APIs refuse', () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() });
    vi.stubGlobal('Audio', class { constructor() { throw new Error('blocked'); } });
    expect(() => new NativeNotifications(client).show(event, centre('janus'))).not.toThrow();
    expect(notifications).toHaveLength(0);
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });
});
