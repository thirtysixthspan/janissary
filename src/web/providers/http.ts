import { firstLine, isTimeout } from '../../models/providers/result.js';
import { ProviderRequestError, type WebSearchCapability } from './contract.js';

export async function requestJson(
  capability: WebSearchCapability,
  url: string | URL,
  init: Omit<RequestInit, 'signal'>,
  timeoutMs: number,
): Promise<unknown> {
  const signal = attemptSignal(capability, timeoutMs);
  const response = await send(capability, url, init, signal, timeoutMs);
  if (!response.ok) {
    throw new ProviderRequestError(`HTTP ${response.status} ${response.statusText}`.trim());
  }
  const text = await readText(capability, response, timeoutMs);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError('invalid response');
  }
}

function attemptSignal(capability: WebSearchCapability, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return capability.signal ? AbortSignal.any([capability.signal, timeout]) : timeout;
}

async function send(
  capability: WebSearchCapability,
  url: string | URL,
  init: Omit<RequestInit, 'signal'>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await capability.fetch(url, { ...init, signal });
  } catch (error) {
    throw classifyRequestError(capability.signal, error, timeoutMs);
  }
}

async function readText(
  capability: WebSearchCapability,
  response: Response,
  timeoutMs: number,
): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    throw classifyRequestError(capability.signal, error, timeoutMs);
  }
}

function classifyRequestError(
  signal: AbortSignal | undefined,
  error: unknown,
  timeoutMs: number,
): unknown {
  if (signal?.aborted === true) return error;
  if (isTimeout(error)) return new ProviderRequestError(`timed out after ${timeoutMs / 1000} s`);
  return new ProviderRequestError(firstLine(error));
}
