import { firstLine } from '../../models/providers/result.js';
import { isRecord } from '../../value-guards.js';
import { ProviderRequestError, type WebFetchPage } from './contract.js';

export function decodeTavilyPage(body: unknown, requestedUrl: string): WebFetchPage {
  const results = isRecord(body) ? body.results : undefined;
  const first = Array.isArray(results) ? firstRecord(results[0]) : undefined;
  if (first && typeof first.raw_content === 'string') {
    return {
      url: typeof first.url === 'string' && first.url.length > 0 ? first.url : requestedUrl,
      content: first.raw_content,
    };
  }
  const failures = isRecord(body) ? body.failed_results : undefined;
  const failure = Array.isArray(failures) ? firstRecord(failures[0]) : undefined;
  if (failure && typeof failure.error === 'string') {
    throw couldNotFetch(failure.error);
  }
  throw new ProviderRequestError('invalid response');
}

export function couldNotFetch(error: string): ProviderRequestError {
  return new ProviderRequestError(`could not fetch: ${firstLine(error)}`);
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}
