import { useEffect } from 'react';
import type { StateEvent } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { NativeNotifications } from './native-notifications';
import { createAlertPlacement, type DockedAlertSelection } from './alert-placement';

export function useNativeNotifications(client: JanusClient, docked?: DockedAlertSelection): void {
  useEffect(() => {
    const notifications = new NativeNotifications(client);
    let latest: StateEvent | undefined;
    const placement = createAlertPlacement(() => latest, docked);
    const unsubscribeState = client.onState((state) => {
      latest = state;
    });
    const unsubscribeEvent = client.onNativeNotification((event) => notifications.show(event, placement));
    return () => {
      unsubscribeEvent();
      unsubscribeState();
      notifications.dispose();
    };
  }, [client, docked]);
}
