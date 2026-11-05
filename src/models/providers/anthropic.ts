import type { ModelRecord } from '../catalog-file.js';
import { firstLine, isTimeout, PROVIDER_TIMEOUT_MS, type ProviderOutcome } from './result.js';

const API_URL = 'https://api.anthropic.com/v1/models';
const API_VERSION = '2023-06-01';
type AnthropicPage = { data: { id: string; display_name: string }[]; has_more: boolean; last_id?: string | null };

export type AnthropicFetchOptions = { apiKey?: string; fetcher?: typeof fetch };

export async function fetchAnthropicModels(
  refreshSignal: AbortSignal,
  options: AnthropicFetchOptions = {},
): Promise<ProviderOutcome> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { status: 'skipped', reason: 'ANTHROPIC_API_KEY is not set' };
  try {
    const signal = AbortSignal.any([refreshSignal, AbortSignal.timeout(PROVIDER_TIMEOUT_MS)]);
    const records = await fetchAnthropicPages(options.fetcher ?? fetch, apiKey, signal);
    return { status: 'ok', records };
  } catch (error) {
    if (isTimeout(error)) return { status: 'failed', reason: 'timed out after 30 s' };
    return { status: 'failed', reason: firstLine(error) };
  }
}

async function fetchAnthropicPages(
  fetcher: typeof fetch,
  apiKey: string,
  signal: AbortSignal,
): Promise<ModelRecord[]> {
  const records: ModelRecord[] = [];
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  while (true) {
    const page = await fetchAnthropicPage(fetcher, apiKey, signal, cursor);
    for (const model of page.data) {
      if (ids.has(model.id)) throw new Error('duplicate model id in Anthropic response');
      ids.add(model.id);
      records.push({ id: model.id, name: model.display_name });
    }
    if (!page.has_more) return records;
    if (!page.last_id || cursors.has(page.last_id)) {
      throw new Error('Anthropic pagination cursor did not advance');
    }
    cursors.add(page.last_id);
    cursor = page.last_id;
  }
}

async function fetchAnthropicPage(
  fetcher: typeof fetch,
  apiKey: string,
  signal: AbortSignal,
  cursor: string | undefined,
): Promise<AnthropicPage> {
  const url = new URL(API_URL);
  if (cursor) url.searchParams.set('after_id', cursor);
  const response = await fetcher(url, {
    method: 'GET',
    headers: { 'x-api-key': apiKey, 'anthropic-version': API_VERSION },
    signal,
  });
  if (!response.ok) {
    const status = `${response.status} ${response.statusText}`.trim();
    throw new Error(status || `HTTP ${response.status}`);
  }
  return decodePage(await response.json());
}

function decodePage(value: unknown): AnthropicPage {
  if (!isObject(value) || !Array.isArray(value.data) || typeof value.has_more !== 'boolean') {
    throw new Error('invalid Anthropic models response');
  }
  const data: AnthropicPage['data'] = [];
  for (const item of value.data) {
    if (!isObject(item) || typeof item.id !== 'string' || !item.id
      || typeof item.display_name !== 'string') {
      throw new Error('invalid Anthropic model entry');
    }
    data.push({ id: item.id, display_name: item.display_name });
  }
  if (value.last_id !== undefined && value.last_id !== null && typeof value.last_id !== 'string') {
    throw new Error('invalid Anthropic pagination cursor');
  }
  return {
    data,
    has_more: value.has_more,
    ...(typeof value.last_id === 'string' && { last_id: value.last_id }),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
