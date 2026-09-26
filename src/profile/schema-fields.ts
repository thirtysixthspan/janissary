// The primitive field checks every profile section is validated with, extracted from `schema.ts` to
// keep it under the file-size limit — see `ai/guidelines/code-guidelines.md`.

export type FieldKind = 'string' | 'number' | 'boolean' | 'string[]' | 'object[]';

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeKind(kind: FieldKind): string {
  if (kind === 'string[]') return 'an array of strings';
  if (kind === 'object[]') return 'an array of objects';
  return kind === 'boolean' ? 'a boolean' : `a ${kind}`;
}

function matchesKind(value: unknown, kind: FieldKind): boolean {
  if (kind === 'string[]') return Array.isArray(value) && value.every((item) => typeof item === 'string');
  if (kind === 'object[]') return Array.isArray(value) && value.every((item) => isObject(item));
  return typeof value === kind;
}

// Validate one optional (or required) field of an object against a kind, returning a located
// message per problem. An absent optional field is fine; an absent required field is a problem.
export function checkField(obj: Record<string, unknown>, key: string, kind: FieldKind, loc: string, required = false): string[] {
  const value = obj[key];
  if (value === undefined) return required ? [`${loc}: ${key} is required`] : [];
  return matchesKind(value, kind) ? [] : [`${loc}: ${key} must be ${describeKind(kind)}`];
}
