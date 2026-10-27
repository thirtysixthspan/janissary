import { readToken, skipSpaces } from '../command/quoted-token.js';

export const VIEW_KEYWORDS = ['expand', 'collapse', 'cursor', 'anchor', 'select'] as const;

export type ViewStep =
  | { kind: 'expand'; path: string }
  | { kind: 'collapse'; path: string }
  | { kind: 'cursor'; path: string }
  | { kind: 'anchor'; path: string }
  | { kind: 'select'; path: string };

export type ReadViewStep = { step: ViewStep; next: number } | { error: string };

function isViewKeyword(value: string): value is ViewStep['kind'] {
  return VIEW_KEYWORDS.includes(value as ViewStep['kind']);
}

export function readViewStep(input: string, index: number): ReadViewStep | undefined {
  const keyword = readToken(input, index);
  if (!keyword || input.slice(keyword.start, keyword.end) !== keyword.value) return undefined;
  const kind = keyword.value.toLowerCase();
  if (!isViewKeyword(kind)) return undefined;
  const valueStart = skipSpaces(input, keyword.end);
  if (valueStart === input.length) return undefined;
  const value = readToken(input, valueStart);
  if (!value) return { error: 'files: unterminated quote' };
  return { step: { kind, path: value.value }, next: value.end };
}
