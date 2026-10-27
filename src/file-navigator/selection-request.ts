import { messageBus } from '../bus.js';
import type { FileNavigatorSelectionRecord } from '../protocol/file-navigator.js';

// The round trip for a file navigator's client-only state. A tree's expanded directories live on
// the server, but its cursor, range anchor, and multi-row selection are React state in the web
// client, and there is no continuous reporting of them. `profile save` captures them for a profile;
// `files print` uses them to print a reusable command. Both ask once and wait briefly for whatever
// arrives — the same shape `client-layout.ts` plays for sidebar sizes, but request/response rather
// than last-report-wins.

export type TreeSelection = { cursor?: string; anchor?: string; selected: string[] };

// No reply inside this window resolves to an empty map, which is what a save with no client
// attached (or under `--no-open`) gets. Only the three selection keys are lost; `expanded` is read
// from server state and always saves.
const REPLY_TIMEOUT_MS = 250;

type Pending = {
  id: number;
  resolve: (selections: Map<string, TreeSelection>) => void;
  timer: ReturnType<typeof setTimeout>;
  promise?: Promise<Map<string, TreeSelection>>;
};

let pending: Pending | undefined;
let nextId = 1;

function settle(selections: Map<string, TreeSelection>): void {
  if (!pending) return;
  clearTimeout(pending.timer);
  const { resolve } = pending;
  pending = undefined;
  resolve(selections);
}

// Ask every connected client for its navigators' selections, keyed by tab label. A caller joining a
// request already in flight gets the same answer, captured at the same moment.
export function requestTreeSelections(timeoutMs = REPLY_TIMEOUT_MS): Promise<Map<string, TreeSelection>> {
  if (pending) return pending.promise ?? Promise.resolve(new Map());
  const id = nextId++;
  let request: Pending | undefined;
  const promise = new Promise<Map<string, TreeSelection>>((resolve) => {
    request = { id, resolve, timer: setTimeout(() => { settle(new Map()); }, timeoutMs) };
    pending = request;
  });
  if (!request) return Promise.resolve(new Map());
  request.promise = promise;
  messageBus.emit('fileNavigator', { type: 'collect', id });
  return promise;
}

// Settle the request in flight with a client's answer. An `id` that doesn't match the outstanding
// request is ignored, so a late reply to a previous save never lands in this one. With several
// clients connected the first reply wins and the rest are ignored — a save captures whichever
// window answered first.
export function resolveTreeSelections(id: number, records: FileNavigatorSelectionRecord[]): void {
  if (pending?.id !== id) return;
  const selections = new Map<string, TreeSelection>();
  for (const record of records) {
    selections.set(record.label, { cursor: record.cursor, anchor: record.anchor, selected: record.selected });
  }
  settle(selections);
}
