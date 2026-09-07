import { useCallback, useRef, useState } from 'react';
import type { RouteChooserView } from '@shared/protocol';
import type { JanusClient } from '../ws';

// State and handlers for the server-driven route chooser — the one overlay whose open/closed state
// is a view object rather than a boolean (`route` is null when closed), and the one whose selection
// index the server's own state stream re-seeds. `routeRef` is that seeding contract: `useServerState`
// compares each incoming view against it to tell a newly-opened chooser from a re-render of an open
// one, and writes the new view back. Mirrors the shape of the picker hooks beside it.
export function useRouteChooser(client: JanusClient) {
  const [route, setRoute] = useState<RouteChooserView | null>(null);
  const [routeIndex, setRouteIndex] = useState(0);
  const routeRef = useRef<RouteChooserView | null>(null);

  const chooseRoute = useCallback(
    (index: number) => client.send({ method: 'chooseRoute', params: { index } }),
    [client],
  );

  return { route, setRoute, routeIndex, setRouteIndex, routeRef, chooseRoute };
}
