import { ProviderRequestError } from './contract.js';

export const LOCAL_MAX_BODY_BYTES = 50 * 1024 * 1024;

const TOO_LARGE = 'response larger than 50 MB';

async function swallowCancel(cancel: () => Promise<void>): Promise<void> {
  try {
    await cancel();
  } catch {
    return;
  }
}

export async function readCappedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const body = response.body;
  const length = response.headers.get('content-length');
  if (length !== null && /^\d+$/.test(length) && Number(length) > maxBytes) {
    if (body !== null) await swallowCancel(() => body.cancel());
    throw new ProviderRequestError(TOO_LARGE);
  }
  if (body === null) return new Uint8Array();

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await swallowCancel(() => reader.cancel());
      throw new ProviderRequestError(TOO_LARGE);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}
