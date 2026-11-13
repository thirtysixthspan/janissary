import type { Managers } from '../managers.js';
import { LocalFileSystemPort, type FileSystemPort } from '../file-navigator/filesystem-port.js';
import { localReadRoot } from '../file-read/tab-read.js';
import { withRemoteTabPort } from '../file-read/remote-tab-port.js';
import { NO_MATCHING_TEXT_REASON, type FileMutationRequest } from './types.js';
import { parseFileMutation } from './command.js';
import { editSuccessLine, writeSuccessLine } from './messages.js';
import { namesDirectory } from './target.js';
import { mutationFailureLine, mutationRejectionLine } from './outcome.js';

function illFormedReason(request: FileMutationRequest): string | undefined {
  if (request.kind === 'write') return request.content.isWellFormed() ? undefined : 'Not a text file';
  if (!request.oldString.isWellFormed()) return NO_MATCHING_TEXT_REASON;
  return request.newString.isWellFormed() ? undefined : 'Not a text file';
}

async function applyMutation(port: FileSystemPort, root: string, request: FileMutationRequest): Promise<string> {
  if (namesDirectory(request.path)) return mutationFailureLine('Is a directory', request.path);
  const refused = illFormedReason(request);
  if (refused !== undefined) return mutationFailureLine(refused, request.path);
  if (request.kind === 'write') {
    const content = Buffer.from(request.content, 'utf8');
    const result = await port.writeFile(root, request.path, content, request.expectedHash, 'tool-text');
    return result.ok ? writeSuccessLine(request.path) : mutationFailureLine(result.reason, request.path);
  }
  const result = await port.editFile(root, request.path, request.oldString, request.newString, request.replaceAll);
  return result.ok
    ? editSuccessLine(request.path, result.value.replacements)
    : mutationFailureLine(result.reason, request.path);
}

export async function runFileMutation(port: FileSystemPort, root: string, input: string): Promise<string> {
  const request = parseFileMutation(input);
  if ('error' in request) return request.error;
  try {
    return await applyMutation(port, root, request);
  } catch (error) {
    return mutationRejectionLine(error, request.path);
  }
}

function mutateRemoteFile(managers: Managers, label: string, input: string): Promise<string> {
  return withRemoteTabPort(managers, label, 'file-write', (port, workspace) => runFileMutation(port, workspace, input));
}

export async function mutateFileInTab(managers: Managers, label: string, input: string): Promise<string> {
  const parsed = parseFileMutation(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return mutateRemoteFile(managers, label, input);
  return runFileMutation(new LocalFileSystemPort(), root, input);
}
