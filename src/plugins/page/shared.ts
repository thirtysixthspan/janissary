// The page plugin's payload and intent contract. Imports nothing — not even a type — because the
// client runs these guards through `@shared`, where a relative NodeNext import or a server module
// would follow them into the browser graph.

export const PAGE_PAYLOAD_SCHEMA_VERSION = 1;

// What one embedded page tab shows: the normalized address loaded into the view, and the root domain
// the tab is named after. The visible-text snapshot a monitor reads is deliberately absent — it is
// server-only state and never crosses the wire.
export type PagePayload = {
  url: string;
  domain: string;
};

// The address typed into the header. Deliberately unvalidated here beyond being a string: what makes
// an address viewable is the host's web-target normalization, which runs on the server.
export type NavigateIntent = {
  url: string;
};

// One relay from the embedded page's content script: the text currently visible in the viewport, and
// the address the page is actually on, which moves when the user follows a link inside the page.
export type SyncIntent = {
  url: string;
  text: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPagePayload(value: unknown): value is PagePayload {
  if (!isRecord(value)) return false;
  return typeof value.url === 'string' && typeof value.domain === 'string';
}

export function isNavigateIntent(value: unknown): value is NavigateIntent {
  return isRecord(value) && typeof value.url === 'string';
}

export function isSyncIntent(value: unknown): value is SyncIntent {
  return isRecord(value) && typeof value.url === 'string' && typeof value.text === 'string';
}
