import { MULTIPLE_MATCHES_REASON, NO_MATCHING_TEXT_REASON } from './types.js';

const NAMED_ESCAPES: Readonly<Record<string, string>> = {
  '\n': String.raw`\n`,
  '\r': String.raw`\r`,
  '\t': String.raw`\t`,
};

function isEscapedCode(code: number): boolean {
  return code < 0x20 || (code >= 0x7F && code <= 0x9F) || code === 0x20_28 || code === 0x20_29;
}

function escapeCharacter(character: string): string {
  const code = character.codePointAt(0) ?? 0;
  if (!isEscapedCode(code)) return character;
  return NAMED_ESCAPES[character] ?? String.raw`\u` + code.toString(16).padStart(4, '0');
}

export function displayPath(path: string): string {
  let result = '';
  for (const character of path) result += escapeCharacter(character);
  return result;
}

export function writeSuccessLine(path: string): string {
  return `Wrote ${displayPath(path)}.`;
}

export function editSuccessLine(path: string, replacements: number): string {
  return `Edited ${displayPath(path)} (${String(replacements)} replacements).`;
}

export function matchFailureLine(reason: string, path: string): string | undefined {
  if (reason === NO_MATCHING_TEXT_REASON) return `${NO_MATCHING_TEXT_REASON}: ${displayPath(path)}.`;
  if (reason === MULTIPLE_MATCHES_REASON) return `${MULTIPLE_MATCHES_REASON}: ${displayPath(path)}; set replaceAll to true.`;
  return undefined;
}
