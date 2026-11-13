import { readFileSync, statSync } from 'node:fs';
import { failureResult, type FileOperationResult } from '../file-navigator/file-operation-result.js';
import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';

export function readBoundedRegularFile(realPath: string): FileOperationResult<Buffer> {
  const stats = statSync(realPath);
  if (!stats.isFile()) return failureResult<Buffer>('Not a text file');
  if (stats.size > FILE_POLICY_MAX_BYTES) return failureResult<Buffer>('File too large (>5 MB)');
  const bytes = readFileSync(realPath);
  if (bytes.byteLength > FILE_POLICY_MAX_BYTES) return failureResult<Buffer>('File too large (>5 MB)');
  return { ok: true, value: bytes };
}
