import { LocalFileSystemPort } from '../file-navigator/filesystem-port.js';
import { globWorkspaceCommand } from '../file-glob/glob.js';
import { isFileGlobCommandLine } from '../file-glob/command.js';
import { grepWorkspaceCommand } from '../file-grep/grep.js';
import { isFileGrepCommandLine } from '../file-grep/command.js';
import { readWorkspaceCommand } from '../file-read/read.js';
import { isFileMutationCommandLine } from '../file-write/command.js';
import { runFileMutation } from '../file-write/tab-write.js';

export function runWorkspaceCommandIn(
  dir: string, command: string, signal?: AbortSignal,
): string | Promise<string> {
  const normalized = command.trim().replace(/^\//, '');
  if (isFileMutationCommandLine(normalized)) {
    return runFileMutation(new LocalFileSystemPort(), dir, normalized);
  }
  if (isFileGlobCommandLine(normalized)) return globWorkspaceCommand(dir, normalized, signal);
  if (isFileGrepCommandLine(normalized)) return grepWorkspaceCommand(dir, normalized);
  return readWorkspaceCommand(dir, normalized);
}
