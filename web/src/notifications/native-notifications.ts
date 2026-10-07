import type { NativeNotificationEvent } from '@shared/protocol';
import type { JanusClient } from '../ws';
import type { AlertPlacement } from './alert-placement';

export class NativeNotifications {
  private lastBell = -Infinity;
  private sounds = new Set<HTMLAudioElement>();

  constructor(private client: JanusClient) {}

  show(event: NativeNotificationEvent, placement: AlertPlacement): void {
    if (document.hasFocus() && placement.isVisible(event.tab)) return;

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
      notification.addEventListener('click', () => {
        window.focus();
        if (!placement.reveal(event.tab)) this.client.send({ method: 'focusTab', params: { label: event.tab } });
        notification.close();
      }, { once: true });
    } catch {
      return;
    }
  }

  dispose(): void {
    for (const sound of this.sounds) sound.pause();
    this.sounds.clear();
  }
}
