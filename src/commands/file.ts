import type { Command } from './types.js';
import { appendCommandOutput } from '../command/append.js';
import { readFileInTab } from '../file-read/tab-read.js';
import { isFileMutationCommandLine } from '../file-write/command.js';
import { mutateFileInTab } from '../file-write/tab-write.js';

export const command: Command = {
  name: 'file',
  match: (command_) => /^file\b/i.test(command_),
  samples: [
    'file',
    'file read README.md',
    'file read src/a.ts --offset 10 --limit 5',
    String.raw`file write {"path":"notes.txt","content":"hello\n"}`,
    'file edit {"path":"notes.txt","oldString":"hello","newString":"hi"}',
  ],
  run: async (command_, tab, managers, invocation) => {
    const output = isFileMutationCommandLine(command_)
      ? await mutateFileInTab(managers, tab.label, command_)
      : await readFileInTab(managers, tab.label, command_);
    appendCommandOutput(managers, tab.label, { input: command_, output }, invocation);
  },
};
