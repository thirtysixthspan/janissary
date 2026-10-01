// Every piece of text the application copies, in the order it copied it.
//
// The seam exists because the two ends cannot import each other: `copyText` is shared code that
// every clipboard writer already goes through, while the subscriber is a lazily-loaded plugin under
// `web/src/overlay-plugins/` that a static import would fold into the entry bundle. The same
// subscribe-and-return-your-unsubscribe shape `drop-registry.ts` uses for the same reason.
//
// The subscriber list holds the history, so nothing here stores the text itself: while no plugin is
// listening, a copy costs a loop over an empty array.

export type ClipboardCopyListener = (text: string) => void;

const listeners = new Set<ClipboardCopyListener>();

// Publishes `listener` and returns the function that removes it again. The removal leaves a later
// registration in place, so a plugin that remounts cannot drop its successor.
export function subscribeClipboardCopies(listener: ClipboardCopyListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Called by the one writer. A listener that throws must not cost the others their copy, and must
// never propagate into the copy chord that caused it — the plugin host owns deciding what a broken
// subscriber means, and a seam is not the place to disable a plugin.
export function captureCopiedText(text: string): void {
  for (const listener of listeners) {
    try {
      listener(text);
    } catch {
      // A subscriber's own failure, already contained at its boundary.
    }
  }
}
