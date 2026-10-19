import { homedir } from 'node:os';
import path from 'node:path';
import { isInsideRoot } from '../files.js';

// The diffed root as the header shows it, in the application's own vocabulary: a workspace clone as
// `$workspace/<name>`, the shared git-sync clone as `$git-sync`, the launch directory as `$root`, a
// path under home as `~`, and anything else absolute. Plugin-local because the host's own abbreviator
// in `src/paths.ts` is host internals the plugin import boundary closes.
export function displayRoot(root: string, launchRoot: string, workspace?: string): string {
  if (workspace !== undefined && root === workspace) return `$workspace/${path.basename(workspace)}`;
  const sync = path.join(launchRoot, '.janissary', 'workspace', 'git-sync');
  if (launchRoot !== '' && isInsideRoot(sync, root)) {
    const relative = path.relative(sync, root).split(path.sep).join('/');
    return relative === '' ? '$git-sync/' : `$git-sync/${relative}`;
  }
  if (launchRoot !== '' && isInsideRoot(launchRoot, root)) {
    const relative = path.relative(launchRoot, root).split(path.sep).join('/');
    return relative === '' ? '$root/' : `$root/${relative}`;
  }
  const home = homedir();
  if (root === home) return '~';
  if (root.startsWith(home + path.sep)) return `~${root.slice(home.length)}`;
  return root;
}
