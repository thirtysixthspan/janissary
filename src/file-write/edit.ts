import { atomicWriteFile } from '../atomic-write.js';
import { failureResult, runFileOperation, type FileOperationResult } from '../file-navigator/file-operation-result.js';
import { readBoundedRegularFile } from './bounded-read.js';
import { checkEditReplacement, decodeEditableText, replaceExactText } from './edit-text.js';
import { createTargetParents, resolveMutationTarget, type WriteTarget } from './target.js';
import type { FileEditValue } from './types.js';

type EditableFile = { text: string; byteLength: number };

function readEditableFile(realPath: string): FileOperationResult<EditableFile> {
  const read = readBoundedRegularFile(realPath);
  if (!read.ok) return read;
  const bytes = read.value;
  const decoded = decodeEditableText(bytes);
  if (!decoded.ok) return decoded;
  return { ok: true, value: { text: decoded.value, byteLength: bytes.byteLength } };
}

function writeEdited(target: WriteTarget, text: string): FileOperationResult {
  const destination = createTargetParents(target);
  if (!destination.ok) return destination;
  return runFileOperation(() => atomicWriteFile(destination.value, Buffer.from(text, 'utf8')));
}

export function editToolTextFile(
  root: string,
  relativePath: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): FileOperationResult<FileEditValue> {
  const replacement = checkEditReplacement(newString);
  if (!replacement.ok) return replacement;
  const target = resolveMutationTarget(root, relativePath);
  if (!target.ok) return target;
  if (!target.value.exists) return failureResult<FileEditValue>('File not found');
  const read = runFileOperation(() => readEditableFile(target.value.realPath));
  if (!read.ok) return read;
  if (!read.value.ok) return read.value;
  const { text, byteLength } = read.value.value;
  const edited = replaceExactText(text, byteLength, oldString, newString, replaceAll);
  if (!edited.ok) return edited;
  const written = writeEdited(target.value, edited.value.text);
  if (!written.ok) return written;
  return { ok: true, value: { replacements: edited.value.replacements } };
}
