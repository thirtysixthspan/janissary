import { readFileSync, statSync } from 'node:fs';
import { atomicWriteFile } from '../atomic-write.js';
import { contentHash, SAVE_CONFLICT_ERROR } from '../editor/save-conflict.js';
import { failureResult, runFileOperation, type FileOperationResult } from '../file-navigator/file-operation-result.js';
import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';
import { createTargetParents, resolveMutationTarget, type WriteTarget } from './target.js';

function encodeToolText(content: string): FileOperationResult<Buffer> {
  if (content.includes('\0')) return failureResult<Buffer>('Not a text file');
  if (!content.isWellFormed()) return failureResult<Buffer>('Not a text file');
  const encoded = Buffer.from(content, 'utf8');
  if (encoded.byteLength > FILE_POLICY_MAX_BYTES) return failureResult<Buffer>('File too large (>5 MB)');
  return { ok: true, value: encoded };
}

function readExistingText(realPath: string): FileOperationResult<string> {
  if (statSync(realPath).size > FILE_POLICY_MAX_BYTES) return failureResult<string>('File too large (>5 MB)');
  const onDisk = readFileSync(realPath, 'utf8');
  return { ok: true, value: onDisk.startsWith('\u{FEFF}') ? onDisk.slice(1) : onDisk };
}

function checkExpectedHash(target: WriteTarget, expectedHash: string | undefined): FileOperationResult {
  if (expectedHash === undefined || !target.exists) return { ok: true, value: undefined };
  const read = runFileOperation(() => readExistingText(target.realPath));
  if (!read.ok) return read;
  if (!read.value.ok) return read.value;
  return contentHash(read.value.value) === expectedHash ? { ok: true, value: undefined } : failureResult(SAVE_CONFLICT_ERROR);
}

function writeEncoded(target: WriteTarget, encoded: Buffer): FileOperationResult {
  const destination = createTargetParents(target);
  if (!destination.ok) return destination;
  return runFileOperation(() => atomicWriteFile(destination.value, encoded));
}

export function writeToolTextFile(root: string, relativePath: string, content: string, expectedHash?: string): FileOperationResult {
  const encoded = encodeToolText(content);
  if (!encoded.ok) return encoded;
  const target = resolveMutationTarget(root, relativePath);
  if (!target.ok) return target;
  const precondition = checkExpectedHash(target.value, expectedHash);
  if (!precondition.ok) return precondition;
  return writeEncoded(target.value, encoded.value);
}
