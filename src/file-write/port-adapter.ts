import { failureResult, type FileOperationResult } from '../file-navigator/file-operation-result.js';
import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';
import { writeToolTextFile } from './filesystem.js';

function decodeToolText(content: Uint8Array): FileOperationResult<string> {
  try {
    return { ok: true, value: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content) };
  } catch (error) {
    if (error instanceof TypeError) return failureResult<string>('Not a text file');
    throw error;
  }
}

export function writeToolTextBytes(root: string, relPath: string, content: Uint8Array, expectedHash?: string): FileOperationResult {
  if (content.byteLength > FILE_POLICY_MAX_BYTES) return failureResult('File too large (>5 MB)');
  const text = decodeToolText(content);
  if (!text.ok) return text;
  return writeToolTextFile(root, relPath, text.value, expectedHash);
}
