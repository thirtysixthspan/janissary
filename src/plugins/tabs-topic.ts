import { messageBus, type Subscription } from '../bus.js';

const TABS_NOTIFICATION_WINDOW_MS = 100;

export function subscribeTabs(fire: () => void): Subscription {
  let delivery: ReturnType<typeof setTimeout> | undefined;
  const listener = messageBus.on('state', 'dirty', () => {
    if (delivery !== undefined) return;
    delivery = setTimeout(() => {
      delivery = undefined;
      fire();
    }, TABS_NOTIFICATION_WINDOW_MS);
  });
  return {
    unsubscribe: () => {
      listener.unsubscribe();
      if (delivery !== undefined) clearTimeout(delivery);
      delivery = undefined;
    },
  };
}
