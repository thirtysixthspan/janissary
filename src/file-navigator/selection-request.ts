import { messageBus } from '../bus.js';
import type { FileNavigatorSelectionRecord } from '../protocol.js';

// The save-time round trip for a file navigator's client-only state. A tree's expanded directories
// live on the server, but its cursor, range anchor, and multi-row selection are React state in the
// web client, and there is no continuous reporting of them. `profile save` asks for them once,
// waits briefly, and writes whatever arrived — the same shape `client-layout.ts` plays for sidebar
// sizes, but request/response rather than last-report-wins.

export type TreeSelection = { cursor?: string; anchor?: string; selected: string[] };

// No reply inside this window resolves to an empty map, which is what a save with no client
// attached (or under `--no-open`) gets. Only the three selection keys are lost; `expanded` is read
// from server state and always saves.
const REPLY_TIMEOUT_MS = 250;

type Pending = {
  id: number;
  resolve: (selections: Map<number, TreeSelection>) => void;
  timer: ReturnType<typeof setTimeout>;
};

let pending: Pending | undefined;
let nextId = 1;

function settle(selections: Map<number, TreeSelection>): void {
  if (!pending) return;
  clearTimeout(pending.timer);
  const { resolve } = pending;
  pending = undefined;
  resolve(selections);
}

// Ask every connected client for its navigators' selections, keyed by tab index. A request already
// in flight is abandoned (resolved empty) so only one is ever outstanding.
export function requestTreeSelections(timeoutMs = REPLY_TIMEOUT_MS): Promise<Map<number, TreeSelection>> {
  settle(new Map());
  const id = nextId++;
  return new Promise((resolve) => {
    pending = { id, resolve, timer: setTimeout(() => { settle(new Map()); }, timeoutMs) };
    messageBus.emit('fileNavigator', { type: 'collect', id });
  });
}

// Settle the request in flight with a client's answer. An `id` that doesn't match the outstanding
// request is ignored, so a late reply to a previous save never lands in this one. With several
// clients connected the first reply wins and the rest are ignored — a save captures whichever
// window answered first.
export function resolveTreeSelections(id: number, records: FileNavigatorSelectionRecord[]): void {
  if (pending?.id !== id) return;
  const selections = new Map<number, TreeSelection>();
  for (const record of records) {
    selections.set(record.index, { cursor: record.cursor, anchor: record.anchor, selected: record.selected });
  }
  settle(selections);
}
