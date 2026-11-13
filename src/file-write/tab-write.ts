import type { Managers } from '../managers.js';
import { LocalFileSystemPort, type FileSystemPort } from '../file-navigator/filesystem-port.js';
import { RemoteFileSystemPort } from '../file-navigator/remote/port.js';
import { localReadRoot } from '../file-read/tab-read.js';
import type { FileMutationRequest } from './types.js';
import { parseFileMutation } from './command.js';
import { editSuccessLine, writeSuccessLine } from './messages.js';
import { mutationFailureLine, mutationRejectionLine, REMOTE_UNAVAILABLE } from './outcome.js';

let sessionNumber = 0;

async function applyMutation(port: FileSystemPort, root: string, request: FileMutationRequest): Promise<string> {
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

async function mutateRemoteFile(managers: Managers, label: string, input: string): Promise<string> {
  const channel = managers.remote?.get(label);
  const ready = managers.remote?.readyOf(label);
  const workspace = managers.remote?.workspaceOf(label);
  if (!channel || !ready || !workspace) return REMOTE_UNAVAILABLE;
  sessionNumber += 1;
  const port = new RemoteFileSystemPort(channel, `file-write-${String(sessionNumber)}`, ready);
  try {
    return await runFileMutation(port, workspace, input);
  } finally {
    port.dispose();
  }
}

export async function mutateFileInTab(managers: Managers, label: string, input: string): Promise<string> {
  const parsed = parseFileMutation(input);
  if ('error' in parsed) return parsed.error;
  const root = localReadRoot(managers, label);
  if (root === undefined) return mutateRemoteFile(managers, label, input);
  return runFileMutation(new LocalFileSystemPort(), root, input);
}
