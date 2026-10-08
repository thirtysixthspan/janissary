import { isRecord } from '../api.js';

export const MARKDOWN_PAYLOAD_SCHEMA_VERSION = 1;

export type MarkdownPayload = {
  name: string;
  path: string;
  size: string;
  url: string;
};

export function isMarkdownPayload(value: unknown): value is MarkdownPayload {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.path === 'string'
    && typeof value.size === 'string'
    && typeof value.url === 'string';
}
