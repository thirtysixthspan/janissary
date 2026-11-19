import { LocalFileSystemPort } from '../file-navigator/filesystem-port.js';
import { globWorkspaceCommand } from '../file-glob/glob.js';
import { isFileGlobCommandLine } from '../file-glob/command.js';
import { grepWorkspaceCommand } from '../file-grep/grep.js';
import { isFileGrepCommandLine } from '../file-grep/command.js';
import { readWorkspaceCommand } from '../file-read/read.js';
import { isFileMutationCommandLine } from '../file-write/command.js';
import { runFileMutation } from '../file-write/tab-write.js';
import { isFileListCommandLine, parseFileList } from '../file-list/command.js';
import { listFiles } from '../file-list/list-core.js';
import { isFileStatCommandLine, parseFileStat } from '../file-stat/command.js';
import { statFile } from '../file-stat/stat-core.js';
import { parseFileExists } from '../file-exists/command.js';
import { fileExists } from '../file-exists/exists-core.js';
import { parseFileHeadTail } from '../file-head-tail/command.js';
import { headTail } from '../file-head-tail/head-tail-core.js';

const FILE_EXISTS_LINE = /^file\s+exists(\s|$)/i;
const FILE_HEAD_TAIL_LINE = /^file\s+(?:head|tail)(\s|$)/i;

export function runWorkspaceCommandIn(
  dir: string, command: string, signal?: AbortSignal,
): string | Promise<string> {
  const normalized = command.trim().replace(/^\//, '');
  if (isFileMutationCommandLine(normalized)) {
    return runFileMutation(new LocalFileSystemPort(), dir, normalized);
  }
  if (isFileGlobCommandLine(normalized)) return globWorkspaceCommand(dir, normalized, signal);
  if (isFileGrepCommandLine(normalized)) return grepWorkspaceCommand(dir, normalized);
  if (isFileListCommandLine(normalized)) {
    const parsed = parseFileList(normalized);
    return 'error' in parsed ? parsed.error : listFiles(dir, parsed.path);
  }
  if (isFileStatCommandLine(normalized)) {
    const parsed = parseFileStat(normalized);
    return 'error' in parsed ? parsed.error : statFile(dir, parsed.path);
  }
  if (FILE_EXISTS_LINE.test(normalized)) {
    const parsed = parseFileExists(normalized);
    return 'error' in parsed ? parsed.error : fileExists(dir, parsed.path);
  }
  if (FILE_HEAD_TAIL_LINE.test(normalized)) {
    const parsed = parseFileHeadTail(normalized);
    return 'error' in parsed ? parsed.error : headTail(dir, parsed);
  }
  return readWorkspaceCommand(dir, normalized);
}
