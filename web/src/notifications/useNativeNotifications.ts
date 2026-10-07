import { useEffect } from 'react';
import type { JanusClient } from '../ws';
import { NativeNotifications } from './native-notifications';

export function useNativeNotifications(client: JanusClient): void {
  useEffect(() => {
    const notifications = new NativeNotifications(client);
    let focusedTab: string | undefined;
    const unsubscribeState = client.onState((state) => {
      focusedTab = state.tabs[state.activeTab]?.label;
    });
    const unsubscribeEvent = client.onNativeNotification((event) => notifications.show(event, focusedTab));
    return () => {
      unsubscribeEvent();
      unsubscribeState();
      notifications.dispose();
    };
  }, [client]);
}
