import path from 'node:path';

export const workspaceDirectories = { root: '', workspace: '' };

export function workspacePathEnvironment(): { root: string; workspace: string } {
  const root = workspaceDirectories.root || process.cwd();
  return { root, workspace: workspaceDirectories.workspace || path.join(root, '.janissary', 'workspace') };
}
