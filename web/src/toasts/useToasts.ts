import { useEffect, useRef, useState } from 'react';
import type { JanusClient } from '../ws';
import { ToastQueue, type Toast } from './toast-queue';

// Bridges the client's toast and clear events into React state. The queue owns every clock; this
// hook owns the queue's lifetime, subscribes to it, and hands the component the list plus the two
// pointer intents it needs.
export function useToasts(client: JanusClient, notificationsVisible: boolean): {
  toasts: Toast[];
  hold: (id: number) => void;
  release: (id: number) => void;
  clear: () => void;
} {
  const queue = useRef<ToastQueue>(undefined);
  queue.current ??= new ToastQueue();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notificationsVisibleRef = useRef(notificationsVisible);
  notificationsVisibleRef.current = notificationsVisible;

  useEffect(() => {
    const active = queue.current!;
    const unsubscribes = [
      active.subscribe((next) => setToasts(next)),
      client.onToast((event) => { if (!notificationsVisibleRef.current) active.add(event); }),
      client.onToastClear(() => active.clear()),
    ];
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
      active.dispose();
    };
  }, [client]);

  return {
    toasts,
    hold: (id) => queue.current!.hold(id),
    release: (id) => queue.current!.release(id),
    clear: () => queue.current!.clear(),
  };
}
