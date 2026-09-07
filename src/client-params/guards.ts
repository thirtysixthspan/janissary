// Field checks for the websocket ingress boundary, the counterpart to `nonEmptyString`/
// `positiveInteger`/`decodeEnv` in `../remote/frame-decode.ts`. A decoder answers one question —
// "is every field the dispatcher will read of its declared type" — so an extra key the client
// happens to send is accepted: the dispatcher never reads a key it does not know, and refusing one
// would only stop a client a version ahead from talking at all.

export type ParamsDecoder = (params: Record<string, unknown>) => boolean;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isBoolean(value: unknown): boolean {
  return typeof value === 'boolean';
}

// Sizes reported after a manual drag are fractional pixels and a percentage, so they are checked
// for being a real number rather than for being whole.
export function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isInteger(value: unknown): boolean {
  return Number.isSafeInteger(value);
}

export function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function optionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}

export function optionalBoolean(value: unknown): boolean {
  return value === undefined || isBoolean(value);
}

// The declared type of these fields *is* a literal union, so checking the type is checking
// membership — unlike a range rule, which belongs to whichever code owns the meaning.
export function isOneOf(value: unknown, allowed: readonly unknown[]): boolean {
  return allowed.includes(value);
}

export function optionalOneOf(value: unknown, allowed: readonly unknown[]): boolean {
  return value === undefined || allowed.includes(value);
}

// The seven methods declaring `params: Record<string, never>`. Their dispatch arms read nothing, so
// any object is acceptable; written once here rather than left as an unexplained omission.
export const noParams: ParamsDecoder = () => true;
