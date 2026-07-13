import type { Command } from './types.js';

// `files [path]` opens a file tree tab rooted at the issuing tab's cwd, or at `path` when given.
// `files left [path]` / `files right [path]` dock the tree into that sidebar instead of the
// central tab strip (a directory literally named `left`/`right` is still reachable, e.g. `files
// ./left`, since the keyword is only recognized as the first word). `files in <label> [on <side>]`
// / `files on <side> [in <label>]` root the tree at another tab's cwd and/or dock it explicitly.
export const command: Command = {
  name: 'files',
  match: (command_) => /^files\b/i.test(command_),
  run: (command_, tab, managers) => {
    managers.tab.append(tab.label, { input: command_, output: '' });
    managers.fileTree.open(command_, tab.label);
  },
};
