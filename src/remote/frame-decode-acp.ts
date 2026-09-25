import { malformed, nonEmptyString, type DecodeResult } from './frame-decode-shared.js';

// The ACP family's decoders, in their own module for the same reason `frame-decode-history.ts` has
// one: `frame-decode.ts` is the dispatcher, and six frame shapes are more validation than a
// dispatcher arm should hold.

// Reject an array and `null` the way `decodeTokens` in `frame-decode.ts` does, and every non-string
// value with them: an environment override map is spread straight over the ACP subprocess's
// environment.
function decodeEnv(value: unknown): Record<string, string> | undefined | 'invalid' {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'invalid';
  const env: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') return 'invalid';
    env[key] = item;
  }
  return env;
}

export function decodeAcpOpen(record: Record<string, unknown>): DecodeResult {
  const { id, command, args, offline } = record;
  const env = decodeEnv(record.env);
  if (!nonEmptyString(id) || !nonEmptyString(command) || env === 'invalid'
    || !Array.isArray(args) || args.some((argument) => typeof argument !== 'string')
    || !(offline === undefined || typeof offline === 'boolean')) return malformed('acp-open');
  return {
    type: 'acp-open', id, command, args: args as string[],
    ...(env !== undefined && { env }),
    ...(offline !== undefined && { offline }),
  };
}

// An empty prompt cannot occur (`AcpManager.run` refuses one before sending) but an empty chunk is
// ordinary, so the text is checked for being a string rather than for being nonempty.
export function decodeAcpText(type: 'acp-prompt' | 'acp-chunk', record: Record<string, unknown>): DecodeResult {
  if (!nonEmptyString(record.id) || typeof record.text !== 'string') return malformed(type);
  return { type, id: record.id, text: Buffer.from(record.text, 'base64').toString('utf8') };
}

export function decodeAcpAddressed(type: 'acp-close' | 'acp-ready', record: Record<string, unknown>): DecodeResult {
  return nonEmptyString(record.id) ? { type, id: record.id } : malformed(type);
}

export function decodeAcpEnd(record: Record<string, unknown>): DecodeResult {
  if (!nonEmptyString(record.id) || !nonEmptyString(record.stopReason)) return malformed('acp-end');
  return { type: 'acp-end', id: record.id, stopReason: record.stopReason };
}

// `fatal` is required rather than optional: an absent flag would default a dead session to
// "recoverable", which is the wrong way for this one to fail.
export function decodeAcpError(record: Record<string, unknown>): DecodeResult {
  const { id, message, fatal } = record;
  if (!nonEmptyString(id) || !nonEmptyString(message) || typeof fatal !== 'boolean') return malformed('acp-error');
  return { type: 'acp-error', id, message, fatal };
}
