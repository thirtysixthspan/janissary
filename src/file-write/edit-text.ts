import { failureResult, type FileOperationResult } from '../file-navigator/file-operation-result.js';
import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';
import { MULTIPLE_MATCHES_REASON, NO_MATCHING_TEXT_REASON } from './types.js';

export interface EditedText {
  text: string;
  replacements: number;
}

const NUL = String.fromCodePoint(0);

export function checkEditReplacement(newString: string): FileOperationResult {
  if (newString.includes(NUL) || !newString.isWellFormed()) return failureResult('Not a text file');
  return { ok: true, value: undefined };
}

export function decodeEditableText(bytes: Uint8Array): FileOperationResult<string> {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return failureResult<string>('Not a text file');
  }
  if (text.includes(NUL)) return failureResult<string>('Not a text file');
  return { ok: true, value: text };
}

function countMatches(text: string, oldString: string): number {
  let count = 0;
  let index = text.indexOf(oldString);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(oldString, index + oldString.length);
  }
  return count;
}

export function replaceExactText(
  text: string,
  byteLength: number,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): FileOperationResult<EditedText> {
  if (oldString === '' || !oldString.isWellFormed()) return failureResult<EditedText>(NO_MATCHING_TEXT_REASON);
  const count = countMatches(text, oldString);
  if (count === 0) return failureResult<EditedText>(NO_MATCHING_TEXT_REASON);
  if (count > 1 && !replaceAll) return failureResult<EditedText>(MULTIPLE_MATCHES_REASON);
  const resultSize = byteLength + count * (Buffer.byteLength(newString) - Buffer.byteLength(oldString));
  if (resultSize > FILE_POLICY_MAX_BYTES) return failureResult<EditedText>('File too large (>5 MB)');
  return { ok: true, value: { text: text.split(oldString).join(newString), replacements: count } };
}
