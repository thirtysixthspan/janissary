import { homedir } from 'node:os';
import { join, sep } from 'node:path';

export type RootContext = {
  // The root path: the directory the application was launched from.
  root: string;
  // The user's home directory (defaults to the OS home); injectable for testing.
  home?: string;
};

// Abbreviate an absolute path for display in the transcript. The launch (root) directory reads as
// `$root`, and the application's hidden state directory inside it (`.janissary`) folds into the root
// too — its `.janissary` segment is elided so its contents read directly under `$root` (e.g. a
// workspace clone at `<root>/.janissary/workspace/<name>` shows as `$root/workspace/<name>`). A path
// elsewhere under home reads as `~`. The longest matching prefix wins. Returns the path unchanged
// when none applies. Display-only — callers keep the real path.
export function abbreviatePath(p: string, context: RootContext): string {
  const { root } = context;
  const state = join(root, '.janissary');
  const home = context.home ?? homedir();
  // State directory inside the root (longest, checked first).
  if (p === state) return '$root/';
  if (p.startsWith(state + sep)) return '$root' + p.slice(state.length);
  // The root directory itself and anything under it.
  if (p === root) return '$root/';
  if (p.startsWith(root + sep)) return '$root' + p.slice(root.length);
  // Elsewhere under home.
  if (p === home) return '~';
  if (p.startsWith(home + sep)) return '~' + p.slice(home.length);
  return p;
}
