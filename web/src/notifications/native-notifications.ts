import type { NativeNotificationEvent } from '@shared/protocol';
import type { JanusClient } from '../ws';
import type { AlertPlacement } from './alert-placement';

export class NativeNotifications {
  private lastBell = -Infinity;
  private sounds = new Set<HTMLAudioElement>();
  private banners = new Map<Notification, () => void>();
  private disposed = false;

  constructor(private client: JanusClient) {}

  show(event: NativeNotificationEvent, placement: AlertPlacement): void {
    if (this.disposed || (document.hasFocus() && placement.isVisible(event.tab))) return;

    if (event.desktop && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      this.showDesktop(event, placement);
    }

    if (event.volume <= 0 || Date.now() - this.lastBell < 1000) return;
    this.lastBell = Date.now();
    try {
      const sound = new Audio(this.client.resourceUrl(`/sounds/${event.category}.mp3`));
      sound.volume = event.volume;
      this.sounds.add(sound);
      sound.addEventListener('ended', () => this.sounds.delete(sound), { once: true });
      void sound.play().catch(() => this.sounds.delete(sound));
    } catch {
      return;
    }
  }

  private showDesktop(event: NativeNotificationEvent, placement: AlertPlacement): void {
    try {
      const notification = new Notification('Janissary', { body: `${event.from}: ${event.message}` });
      const release = (): void => {
        notification.removeEventListener('click', onClick);
        notification.removeEventListener('close', release);
        this.banners.delete(notification);
      };
      const onClick = (): void => {
        release();
        if (this.disposed) return;
        window.focus();
        if (!placement.reveal(event.tab)) this.client.send({ method: 'focusTab', params: { label: event.tab } });
        notification.close();
      };
      notification.addEventListener('click', onClick);
      notification.addEventListener('close', release);
      this.banners.set(notification, release);
    } catch {
      return;
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const [notification, release] of this.banners) {
      release();
      try {
        notification.close();
      } catch {
        continue;
      }
    }
    for (const sound of this.sounds) sound.pause();
    this.sounds.clear();
  }
}
