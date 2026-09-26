import type { RemoteFrame } from '../protocol-frames.js';

// The result type and value-shape predicates every frame decoder is built from, in one place so the
// dispatcher and each family module refuse a frame with the same text and check a field the same way.

export type DecodeResult = RemoteFrame | { error: string };

export function malformed(type: string): DecodeResult {
  return { error: `Malformed remote frame "${type}".` };
}

export function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function optionalNonEmptyString(value: unknown): value is string | undefined {
  return value === undefined || nonEmptyString(value);
}
