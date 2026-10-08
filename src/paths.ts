import { homedir } from 'node:os';
import path from 'node:path';

export type RootContext = {
  // The root path: the directory the application was launched from.
  root: string;
  // The user's home directory (defaults to the OS home); injectable for testing.
  home?: string;
};

// Expand a user-authored path by replacing `~` with the home directory and `$root` with the
// project root. Only the path start is expanded — `~` and `$root` appearing mid-path are left
// as-is. This is the inverse of `abbreviatePath()`.
export function expandUserPath(input: string, context: RootContext): string {
  const { root } = context;

  if (input === '$root' || input === '$root/') return root;
  if (input.startsWith('$root/')) return root + input.slice(5);

  const home = context.home ?? homedir();
  if (input === '~') return home;
  if (input.startsWith('~/')) return home + input.slice(1);

  return input;
}

// The clone's own directory, abbreviated for display: `$workspace/<name>` after its own directory
// name. Total by construction — a workspace clone's directory is always inside itself — and named
// apart from `abbreviateWorkspacePath` below so a caller that has only the clone never has to spell
// out a target it already knows. Works for a clone on any host: a remote clone is a path no local
// `$root` abbreviation could reach, so naming the clone is the only form that fits both.
export function abbreviateWorkspaceDir(workspace: string): string {
  return `$workspace/${path.basename(workspace)}`;
}

// A path at or under a workspace clone, abbreviated for display: the clone's own name after
// `$workspace`, then the path below it (`$workspace/emrah/notes`). `target` defaults to the clone
// itself. Undefined for an absent workspace or a target that leaves the clone, so a caller reading
// some other path can fall back to `abbreviatePath`. Display-only — callers keep the real path.
export function abbreviateWorkspacePath(workspace: string | undefined, target: string): string | undefined {
  if (!workspace) return undefined;
  const base = workspace.endsWith(path.sep) ? workspace.slice(0, -1) : workspace;
  if (target === base) return abbreviateWorkspaceDir(base);
  if (!target.startsWith(base + path.sep)) return undefined;
  const rest = path.relative(base, target).split(path.sep).join('/');
  return rest ? `${abbreviateWorkspaceDir(base)}/${rest}` : abbreviateWorkspaceDir(base);
}

// Abbreviate an absolute path for display in the transcript. The launch (root) directory reads as
// `$root`, and the application's hidden state directory inside it (`.janissary`) folds into the root
// too — its `.janissary` segment is elided so its contents read directly under `$root` (e.g. a
// workspace clone at `<root>/.janissary/workspace/<name>` shows as `$root/workspace/<name>`). A path
// elsewhere under home reads as `~`. The longest matching prefix wins. Returns the path unchanged
// when none applies. Display-only — callers keep the real path.
export function abbreviatePath(p: string, context: RootContext): string {
  const { root } = context;
  const state = path.join(root, '.janissary');
  // State directory inside the root (longest, checked first).
  if (p === state) return '$root/';
  if (p.startsWith(state + path.sep)) return '$root' + p.slice(state.length);
  // The root directory itself and anything under it.
  if (p === root) return '$root/';
  if (p.startsWith(root + path.sep)) return '$root' + p.slice(root.length);
  // Elsewhere under home.
  const home = context.home ?? homedir();
  if (p === home) return '~';
  if (p.startsWith(home + path.sep)) return '~' + p.slice(home.length);
  return p;
}
