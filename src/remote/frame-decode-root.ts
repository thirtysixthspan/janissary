import type { RemoteFrame } from './protocol.js';
import { ROOT_REFUSAL_FIELDS, type RootRefusal, type RootRefusalKind } from './root-refusal.js';
import {
  malformed, nonEmptyString, optionalNonEmptyString, type DecodeResult,
} from './frame-decode-shared.js';

// The decoders for settling a remote project root: the clone offer and its answer, the structured
// refusal, and the two fields that ride on older frames (`provision.origin` and
// `workspace-ready.cloned`). In their own module the way the other `frame-decode-*.ts` families are,
// so `frame-decode.ts` stays the dispatcher.

type Cloned = NonNullable<Extract<RemoteFrame, { type: 'workspace-ready' }>['cloned']>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRefusalKind(value: unknown): value is RootRefusalKind {
  return typeof value === 'string' && Object.hasOwn(ROOT_REFUSAL_FIELDS, value);
}

// Every field the kind carries must be a nonempty string, and a field the kind does not carry is
// not copied: the union says exactly which fields each kind has.
function decodeRefusal(value: unknown): RootRefusal | undefined {
  if (!isRecord(value) || !isRefusalKind(value.kind) || !nonEmptyString(value.path)) return;
  const refusal: Record<string, string> = { kind: value.kind, path: value.path };
  const fields = ROOT_REFUSAL_FIELDS[value.kind];
  for (const field of fields) {
    const item = value[field];
    if (!nonEmptyString(item)) return;
    refusal[field] = item;
  }
  return refusal as RootRefusal;
}

export function decodeCloneOffer(record: Record<string, unknown>): DecodeResult {
  const { path, url, home } = record;
  if (!nonEmptyString(path) || !nonEmptyString(url) || !optionalNonEmptyString(home)) return malformed('clone-offer');
  return { type: 'clone-offer', path, url, ...(home !== undefined && { home }) };
}

export function decodeCloneAnswer(record: Record<string, unknown>): DecodeResult {
  return typeof record.accept === 'boolean' ? { type: 'clone-answer', accept: record.accept } : malformed('clone-answer');
}

export function decodeRootRefused(record: Record<string, unknown>): DecodeResult {
  const refusal = decodeRefusal(record.refusal);
  return refusal ? { type: 'root-refused', refusal } : malformed('root-refused');
}

// `provision.origin`, and the same field on `attach` and `capture-request`: absent, or a nonempty
// string. `false` means present and invalid.
export function decodeOrigin(value: unknown): string | undefined | false {
  if (value === undefined) return undefined;
  return nonEmptyString(value) ? value : false;
}

// `workspace-ready.cloned`: absent, or a record of two nonempty strings. `false` means present and
// invalid.
export function decodeCloned(value: unknown): Cloned | undefined | false {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !nonEmptyString(value.url) || !nonEmptyString(value.path)) return false;
  return { url: value.url, path: value.path };
}
