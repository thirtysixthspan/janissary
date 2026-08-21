import { statSync } from 'node:fs';
import path from 'node:path';
import { openerForExtension } from '../openers/index.js';
import type { TabPluginDeclaration } from '../plugins/api.js';

// A resolved match: the entry to draw, plus the plugin that owns it and the paths it would act on.
// Only the label and the action name ever reach the client — the plugin identity stays server-side,
// so the run RPC re-derives it from the paths rather than trusting a caller to name it.
export type SelectionActionMatch = {
  plugin: string;
  label: string;
  action: string;
  paths: string[];
};

// Which plugin, if any, a whole selection of navigator rows belongs to. The mirror of
// `openersForRow`: that one decides what activating a single row does, this one decides what a
// multi-row selection can be offered, and both walk the same extension registry so the two answers
// can never disagree about who owns a file type.
//
// Deliberately narrow. A selection resolves only when every entry is a file — no directories, no
// `..` — inside the navigator's own root, and every one of them resolves to the same plugin, and
// that plugin's declaration contributes a selection action. Anything else resolves to nothing, so
// the navigator has no entry to draw and no way to hand a plugin a path it does not own.

// One selected row's absolute path, or `undefined` when it does not resolve to a file inside `root`.
// A path that climbs out of the tree is refused here rather than deeper in: the client sends
// tree-relative rows, so anything that leaves the root was never a row it could have selected.
function resolveSelected(root: string, relPath: string): string | undefined {
  const absolute = path.resolve(root, relPath);
  const contained = absolute === root
    || absolute.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
  if (!contained) return undefined;
  try {
    return statSync(absolute).isFile() ? absolute : undefined;
  } catch {
    return undefined;
  }
}

export function resolveSelectionPaths(root: string, relPaths: readonly string[]): string[] {
  const resolved = relPaths.map((relPath) => resolveSelected(root, relPath));
  return resolved.every((absolute) => absolute !== undefined) ? resolved : [];
}

function owningPluginId(paths: readonly string[]): string | undefined {
  const owners = paths.map((absolute) => openerForExtension(path.extname(absolute))?.name);
  const [first] = owners;
  if (first === undefined) return undefined;
  return owners.every((owner) => owner === first) ? first : undefined;
}

// The entry to offer for this selection, or `null`. Reads the declaration alone and never activates
// the plugin: opening a context menu is not a use of it, and a menu that could wake every plugin it
// draws an entry for would put activation cost on a right-click.
export function selectionActionFor(
  declarations: readonly TabPluginDeclaration[],
  root: string,
  relPaths: readonly string[],
): SelectionActionMatch | null {
  if (relPaths.length === 0) return null;
  const paths = resolveSelectionPaths(root, relPaths);
  if (paths.length === 0) return null;
  const owner = owningPluginId(paths);
  if (owner === undefined) return null;
  const contributed = declarations.find((declaration) => declaration.id === owner)?.selectionAction;
  return contributed ? { plugin: owner, label: contributed.label, action: contributed.action, paths } : null;
}
