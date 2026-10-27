import path from 'node:path';
import { abbreviatePath } from '../paths.js';
import type { FileNavigatorDetail } from '../tab/types.js';
import type { TreeSelection } from './selection-request.js';

export type FilesCommandView = {
  root: string;
  launchDir: string;
  home?: string;
  dock?: 'left' | 'right';
  details: FileNavigatorDetail;
  expanded: string[];
  selection?: TreeSelection;
  remote?: { ownerLabel: string; root?: string };
};

function quotePath(value: string): string {
  return /[\s'"]/u.test(value) ? `"${value.replaceAll('"', String.raw`\"`)}"` : value;
}

function localRoot(root: string, launchDir: string, home: string | undefined): string {
  const normalizedRoot = path.resolve(root);
  const normalizedLaunchDir = path.resolve(launchDir);
  const stateRoot = path.join(normalizedLaunchDir, '.janissary');
  if (normalizedRoot === stateRoot) return '$root/.janissary';
  if (normalizedRoot.startsWith(`${stateRoot}${path.sep}`)) {
    return `$root/.janissary${normalizedRoot.slice(stateRoot.length).split(path.sep).join('/')}`;
  }
  return abbreviatePath(normalizedRoot, { root: normalizedLaunchDir, home });
}

function remoteRoot(root: string, workspace: string | undefined): string {
  if (!workspace) return root;
  const relative = path.posix.relative(workspace, root);
  return relative ? `$root/${relative}` : '$root';
}

function rootArgument(view: FilesCommandView): string {
  const root = view.remote
    ? remoteRoot(view.root, view.remote.root)
    : localRoot(view.root, view.launchDir, view.home);
  return quotePath(root);
}

function appendView(parts: string[], view: FilesCommandView): void {
  if (view.remote) return;
  const expanded = view.expanded.toSorted((left, right) => left.localeCompare(right));
  for (const path_ of expanded) {
    parts.push('expand', quotePath(path_));
  }
  if (view.selection?.cursor) parts.push('cursor', quotePath(view.selection.cursor));
  if (view.selection?.anchor) parts.push('anchor', quotePath(view.selection.anchor));
  const selected = view.selection?.selected ?? [];
  for (const path_ of selected) parts.push('select', quotePath(path_));
}

export function formatFilesCommand(view: FilesCommandView): string {
  const parts = ['files'];
  if (view.remote) parts.push('in', quotePath(view.remote.ownerLabel));
  if (view.dock) parts.push('on', view.dock);
  if (view.details !== 'name') parts.push('with', view.details);
  appendView(parts, view);
  parts.push(rootArgument(view));
  return parts.join(' ');
}
