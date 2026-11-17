import { firstLine, isTimeout, PROVIDER_TIMEOUT_MS } from '../../models/providers/result.js';
import { ProviderRequestError, type WebSearchCapability } from '../contract.js';

const TIMEOUT_REASON = 'timed out after 30 s';

export async function requestJson(
  capability: WebSearchCapability,
  url: string | URL,
  init: Omit<RequestInit, 'signal'>,
): Promise<unknown> {
  const signal = capability.signal
    ? AbortSignal.any([capability.signal, AbortSignal.timeout(PROVIDER_TIMEOUT_MS)])
    : AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  const response = await send(capability, url, init, signal);
  if (!response.ok) {
    throw new ProviderRequestError(`HTTP ${response.status} ${response.statusText}`.trim());
  }
  const text = await readText(capability, response);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError('invalid response');
  }
}

async function send(
  capability: WebSearchCapability,
  url: string | URL,
  init: Omit<RequestInit, 'signal'>,
  signal: AbortSignal,
): Promise<Response> {
  try {
    return await capability.fetch(url, { ...init, signal });
  } catch (error) {
    throw classify(capability.signal, error);
  }
}

async function readText(capability: WebSearchCapability, response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    throw classify(capability.signal, error);
  }
}

function classify(signal: AbortSignal | undefined, error: unknown): unknown {
  if (signal?.aborted === true) return error;
  if (isTimeout(error)) return new ProviderRequestError(TIMEOUT_REASON);
  return new ProviderRequestError(firstLine(error));
}
