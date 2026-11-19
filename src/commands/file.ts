import type { Command } from './types.js';
import type { Managers } from '../managers.js';
import { appendCommandOutput } from '../command/append.js';
import { isFileGlobCommandLine } from '../file-glob/command.js';
import { globFilesInTab } from '../file-glob/tab-glob.js';
import { isFileGrepCommandLine } from '../file-grep/command.js';
import { grepFilesInTab } from '../file-grep/tab-grep.js';
import { readFileInTab } from '../file-read/tab-read.js';
import { isFileMutationCommandLine } from '../file-write/command.js';
import { mutateFileInTab } from '../file-write/tab-write.js';
import { isFileListCommandLine } from '../file-list/command.js';
import { listFilesInTab } from '../file-list/tab-list.js';
import { isFileStatCommandLine } from '../file-stat/command.js';
import { statFileInTab } from '../file-stat/tab-stat.js';
import { fileExistsInTab } from '../file-exists/tab-exists.js';
import { headTailInTab } from '../file-head-tail/tab-head-tail.js';

function isFileExistsCommandLine(line: string): boolean {
  return /^file\s+exists(\s|$)/i.test(line);
}

function isFileHeadCommandLine(line: string): boolean {
  return /^file\s+head(\s|$)/i.test(line);
}

function isFileTailCommandLine(line: string): boolean {
  return /^file\s+tail(\s|$)/i.test(line);
}

function fileOutput(managers: Managers, label: string, line: string): Promise<string> {
  if (isFileGlobCommandLine(line)) return globFilesInTab(managers, label, line);
  if (isFileGrepCommandLine(line)) return grepFilesInTab(managers, label, line);
  if (isFileMutationCommandLine(line)) return mutateFileInTab(managers, label, line);
  if (isFileListCommandLine(line)) return listFilesInTab(managers, label, line);
  if (isFileStatCommandLine(line)) return statFileInTab(managers, label, line);
  if (isFileExistsCommandLine(line)) return Promise.resolve(fileExistsInTab(managers, label, line));
  if (isFileHeadCommandLine(line) || isFileTailCommandLine(line)) {
    return Promise.resolve(headTailInTab(managers, label, line));
  }
  return readFileInTab(managers, label, line);
}

export const command: Command = {
  name: 'file',
  match: (command_) => /^file\b/i.test(command_),
  samples: [
    'file',
    'file read README.md',
    'file read src/a.ts --offset 10 --limit 5',
    'file glob **/*.ts',
    'file glob *.md --path product --limit 20',
    'file grep TODO',
    'file grep --literal --include *.md request timed out',
    String.raw`file write {"path":"notes.txt","content":"hello\n"}`,
    'file edit {"path":"notes.txt","oldString":"hello","newString":"hi"}',
    'file patch {"patchText":"*** Delete File: old.txt"}',
    'file list .',
    'file stat notes.md',
    'file exists notes.md',
    'file head notes.md -n 5',
    'file tail notes.md',
  ],
  run: async (command_, tab, managers, invocation) => {
    const output = await fileOutput(managers, tab.label, command_);
    appendCommandOutput(managers, tab.label, { input: command_, output }, invocation);
  },
};
