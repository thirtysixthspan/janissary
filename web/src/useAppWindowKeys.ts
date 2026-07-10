import type { JanusClient } from './ws';
import { useLiveRef } from './useLiveRef';
import { useWindowKeys, type StateSnapshot, type Callbacks } from './useWindowKeys';

// Binds App's picker/chooser state and handlers to the window key handler: one live-ref snapshot
// serves as both the state and the callbacks side of useWindowKeys (they are disjoint field sets).
// Split out of App.tsx to keep it under the file-size limit.
export function useAppWindowKeys(
  client: JanusClient,
  handleScrollKey: (e: KeyboardEvent) => boolean,
  handleScrollKeyUp: (e: KeyboardEvent) => void,
  deps: StateSnapshot & Callbacks,
): void {
  const reference = useLiveRef(deps);
  useWindowKeys(client, reference, reference, handleScrollKey, handleScrollKeyUp);
}
