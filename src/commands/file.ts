import type { Command } from './types.js';
import type { Managers } from '../managers.js';
import { appendCommandOutput } from '../command/append.js';
import { isFileGlobCommandLine } from '../file-glob/command.js';
import { globFilesInTab } from '../file-glob/tab-glob.js';
import { readFileInTab } from '../file-read/tab-read.js';
import { isFileMutationCommandLine } from '../file-write/command.js';
import { mutateFileInTab } from '../file-write/tab-write.js';

function fileOutput(managers: Managers, label: string, line: string): Promise<string> {
  if (isFileGlobCommandLine(line)) return globFilesInTab(managers, label, line);
  if (isFileMutationCommandLine(line)) return mutateFileInTab(managers, label, line);
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
    String.raw`file write {"path":"notes.txt","content":"hello\n"}`,
    'file edit {"path":"notes.txt","oldString":"hello","newString":"hi"}',
  ],
  run: async (command_, tab, managers, invocation) => {
    const output = await fileOutput(managers, tab.label, command_);
    appendCommandOutput(managers, tab.label, { input: command_, output }, invocation);
  },
};
