export const MARKDOWN_PAYLOAD_SCHEMA_VERSION = 1;

export type MarkdownPayload = {
  name: string;
  path: string;
  size: string;
  url: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isMarkdownPayload(value: unknown): value is MarkdownPayload {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.path === 'string'
    && typeof value.size === 'string'
    && typeof value.url === 'string';
}
