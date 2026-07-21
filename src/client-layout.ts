type ClientLayout = { sidebarLeft: number; sidebarRight: number; tabAreaPct: number };

let lastReported: ClientLayout | undefined;

// In-process holder for the latest sidebar/tab-area sizes reported by the web client via the
// `reportLayout` RPC — the reverse of the server->client `layout` event. `profile save` reads this
// synchronously when writing a profile's `layout` key; last report wins. Mirrors `window-resizer.ts`.
export function setClientLayout(layout: ClientLayout): void {
  lastReported = layout;
}

export function getClientLayout(): ClientLayout | undefined {
  return lastReported;
}
