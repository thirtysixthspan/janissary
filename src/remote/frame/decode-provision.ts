import { PROJECT_TOKENS, type ProjectTokens } from '../../project/tokens.js';
import type { GitIdentity } from '../../git/identity.js';
import { decodeOrigin } from './decode-root.js';
import { malformed, nonEmptyString, type DecodeResult } from './decode-shared.js';

// The `provision` decoder, in its own module for the same reason `frame-decode-history.ts` has one:
// `frame-decode.ts` is the dispatcher, and a frame carrying two records of adopted settings is more
// validation than a dispatcher arm should hold.

const TOKEN_NAMES = new Set<string>(PROJECT_TOKENS.map(({ name }) => name));
const IDENTITY_KEYS = new Set<string>(['name', 'email']);

function decodeTokens(value: unknown): ProjectTokens | undefined {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
  const tokens: ProjectTokens = {};
  for (const [name, token] of Object.entries(value)) {
    if (!TOKEN_NAMES.has(name) || !nonEmptyString(token)) return;
    tokens[name as keyof ProjectTokens] = token;
  }
  return tokens;
}

// Same strictness `decodeTokens` applies, for the same reason: the record is installed as this
// machine's git identity, so an unknown key or a non-string value is a mismatched sender rather than
// something to silently drop a field from.
function decodeIdentity(value: unknown): GitIdentity | undefined {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
  const identity: GitIdentity = {};
  for (const [key, item] of Object.entries(value)) {
    if (!IDENTITY_KEYS.has(key) || !nonEmptyString(item)) return;
    identity[key as keyof GitIdentity] = item;
  }
  return identity;
}

export function decodeProvision(record: Record<string, unknown>): DecodeResult {
  const tokens = decodeTokens(record.tokens);
  const identity = decodeIdentity(record.identity);
  const origin = decodeOrigin(record.origin);
  if (!nonEmptyString(record.label) || tokens === undefined || identity === undefined || origin === false) return malformed('provision');
  return {
    type: 'provision',
    label: record.label,
    ...(Object.hasOwn(record, 'tokens') && { tokens }),
    ...(Object.hasOwn(record, 'identity') && { identity }),
    ...(origin !== undefined && { origin }),
  };
}
