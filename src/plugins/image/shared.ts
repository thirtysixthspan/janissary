export const IMAGE_PAYLOAD_SCHEMA_VERSION = 1;

export type ImagePayload = {
  name: string;
  path: string;
  size: string;
  url: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isImagePayload(value: unknown): value is ImagePayload {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.path === 'string'
    && typeof value.size === 'string'
    && typeof value.url === 'string';
}
