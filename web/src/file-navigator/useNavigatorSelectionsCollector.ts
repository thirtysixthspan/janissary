import { useEffect } from 'react';
import type { JanusClient } from '../shared/ws/ws';
import { collectNavigatorSelections } from './file/navigator-selection-registry';

// The file navigator's selections are client-only React state, so the app shell — not the protocol
// client — is what tells the client where to read them from when the server asks.
export function useNavigatorSelectionsCollector(client: JanusClient): void {
  useEffect(
    () => client.registerStateCollector('fileNavigatorSelections', collectNavigatorSelections),
    [client],
  );
}
