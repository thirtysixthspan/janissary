// Additive changes leave this at 1: an older reader ignores a field it does not know, and both
// halves of a bundled plugin ship inside the same build, so they can never disagree about one. The
// first change that removes a field, retypes one, or changes what an existing field means does have
// to bump it — the field-addition exemption stops there.
export const IMAGE_PAYLOAD_SCHEMA_VERSION = 1;

export type ImageMode = 'edit';

export type ImagePayload = {
  name: string;
  path: string;
  size: string;
  url: string;
  // Absent means the viewer. The tab is the same tab either way; this is which half of it is showing.
  mode?: ImageMode;
};

export type SaveEditPayload = { dataUrl: string };
export type SaveEditResult = { name: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isImagePayload(value: unknown): value is ImagePayload {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.path === 'string'
    && typeof value.size === 'string'
    && typeof value.url === 'string'
    && (value.mode === undefined || value.mode === 'edit');
}

export function isSaveEditPayload(value: unknown): value is SaveEditPayload {
  return isRecord(value) && typeof value.dataUrl === 'string';
}

export function isSaveEditResult(value: unknown): value is SaveEditResult {
  return isRecord(value) && typeof value.name === 'string';
}
