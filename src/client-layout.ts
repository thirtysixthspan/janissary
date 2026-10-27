import type { LayoutUpdate } from './protocol/events.js';

type ClientLayout = { sidebarLeft: number; sidebarRight: number; tabAreaPct: number; splitPct: number };

let lastReported: ClientLayout | undefined;

// In-process holder for the latest sidebar/tab-area sizes reported by the web client via the
// `reportLayout` RPC, patched by server->client `layout` updates. `profile save` reads this
// synchronously when writing a profile's `layout` key; last report wins. Mirrors `window-resizer.ts`.
export function setClientLayout(layout: ClientLayout): void {
  lastReported = layout;
}

export function patchClientLayout(update: LayoutUpdate): void {
  if (!lastReported) return;
  lastReported = {
    ...lastReported,
    ...(update.sidebarLeft !== undefined && { sidebarLeft: update.sidebarLeft }),
    ...(update.sidebarRight !== undefined && { sidebarRight: update.sidebarRight }),
    ...(update.tabAreaPct !== undefined && { tabAreaPct: update.tabAreaPct }),
    ...(update.splitPct !== undefined && { splitPct: update.splitPct }),
  };
}

export function getClientLayout(): ClientLayout | undefined {
  return lastReported;
}
