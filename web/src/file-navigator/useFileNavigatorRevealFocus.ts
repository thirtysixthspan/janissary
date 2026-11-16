import { useEffect } from 'react';
import type React from 'react';
import type { JanusClient } from '../shared/ws/ws';
import type { useFileNavigatorSelection } from './useFileNavigatorSelection';

// The highest reveal revision each navigator has consumed. Module-level so it survives the remount
// a dock move performs while the server's clear broadcast is still in flight; each label's entry is
// one number, so the map grows with navigators rather than reveals.
const acknowledgedRevisions = new Map<string, number>();

// Focuses the tree for a reveal's focus hint and acknowledges the hint once its selection is applied
// or dropped. The per-label floor keeps a repeat of an already-consumed revision from refocusing or
// resending, and an ordinary hint (no `focusHint`) is left to the selection hook.
export function useFileNavigatorRevealFocus(
  client: JanusClient,
  label: string,
  focusHint: ReturnType<typeof useFileNavigatorSelection>['focusHint'],
  containerRef: React.RefObject<HTMLDivElement | null>,
): void {
  const revision = focusHint?.revision;

  // The revision is the only dependency that can change, so the outcome turning from `pending` to
  // `applied` does not pull focus back out of the navigator's header a second time.
  useEffect(() => {
    if (revision === undefined || revision <= (acknowledgedRevisions.get(label) ?? 0)) return;
    containerRef.current?.focus();
  }, [revision, containerRef, label]);

  useEffect(() => {
    if (focusHint === undefined || focusHint.outcome === 'pending') return;
    if (focusHint.revision <= (acknowledgedRevisions.get(label) ?? 0)) return;
    // Record before sending: StrictMode's second effect pass then finds the revision consumed.
    acknowledgedRevisions.set(label, focusHint.revision);
    client.send({ method: 'fileNavigatorRevealApplied', params: { label, revision: focusHint.revision } });
  }, [client, focusHint, label]);
}
