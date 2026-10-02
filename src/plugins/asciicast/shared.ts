export const ASCIICAST_PAYLOAD_SCHEMA_VERSION = 1;

// The ordinary file-backed tab payload — the served reference, the display name, the path, and the
// human size every file tab carries — plus one boolean the opener is the only thing that can know:
// whether a live tab held this recording when the tab was opened. It is what tells a finished
// recording from a live one when the file itself cannot, since a recording ended by its tab closing
// has no exit event to say so.
export type AsciicastPayload = {
  name: string;
  path: string;
  size: string;
  url: string;
  finished: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isAsciicastPayload(value: unknown): value is AsciicastPayload {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.path === 'string'
    && typeof value.size === 'string'
    && typeof value.url === 'string'
    && typeof value.finished === 'boolean';
}