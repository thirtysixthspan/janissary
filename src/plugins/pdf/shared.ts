export const PDF_PAYLOAD_SCHEMA_VERSION = 1;

// What the tab holds. Deliberately no configured-viewer name: the video payload carries one so its
// view can offer "Open in <player>" when the browser cannot decode, and this plugin answers a failed
// load with a message plus a feed line and no escape-hatch button — the field would have no reader.
export type PdfPayload = {
  name: string;
  path: string;
  size: string;
  url: string;
};

// The closed set of reasons a document can fail to load. The client names one of these; the server
// owns the words that reach the notifications feed, so a client can never dictate the wording.
export const PDF_LOAD_FAILURES = ['password-protected', 'unreadable', 'other'] as const;
export type PdfLoadFailure = (typeof PDF_LOAD_FAILURES)[number];

export type LoadFailedPayload = { reason: PdfLoadFailure };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPdfPayload(value: unknown): value is PdfPayload {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.path === 'string'
    && typeof value.size === 'string'
    && typeof value.url === 'string';
}

export function isPdfLoadFailure(value: unknown): value is PdfLoadFailure {
  return typeof value === 'string'
    && (PDF_LOAD_FAILURES as readonly string[]).includes(value);
}

export function isLoadFailedPayload(value: unknown): value is LoadFailedPayload {
  return isRecord(value) && isPdfLoadFailure(value.reason);
}
