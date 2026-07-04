import type { Command } from './types.js';

// `files [path]` opens a file tree tab rooted at the issuing tab's cwd, or at `path` when given.
export const command: Command = {
  name: 'files',
  match: (command_) => /^files\b/i.test(command_),
  run: (command_, tab, managers) => {
    managers.fileTree.open(command_, tab.label);
  },
};
