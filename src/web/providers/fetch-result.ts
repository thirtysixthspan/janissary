import { isRecord } from '../../value-guards.js';

export type FetchAnswer =
  | { kind: 'fetched'; url: string; content: string }
  | { kind: 'redirected'; url: string };

export function decodeFetchResult(value: unknown): FetchAnswer | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.url === 'string' && typeof value.content === 'string') {
    return { kind: 'fetched', url: value.url, content: value.content };
  }
  if (typeof value.redirectedTo === 'string' && value.redirectedTo.length > 0) {
    return { kind: 'redirected', url: value.redirectedTo };
  }
  return undefined;
}
