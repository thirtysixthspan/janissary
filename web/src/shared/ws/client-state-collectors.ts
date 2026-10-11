import type { FileNavigatorSelectionRecord } from '@shared/protocol';

// The client-only state the server is allowed to ask for, keyed by collector name. The server owns
// everything else, but a few things live solely in React state on this side — a mounted file
// navigator's cursor, anchor, and selection — so a `profile save` has to request them (see the
// `collect-tree-state` event).
//
// Each feature registers its answer with `JanusClient.registerStateCollector`, which is what keeps
// the protocol client from having to import the feature that owns the state. A new request of this
// kind adds a name here and a registration at the app boundary; it never adds an import to `ws.ts`.
export type ClientStateCollectors = {
  fileNavigatorSelections: () => FileNavigatorSelectionRecord[];
};
