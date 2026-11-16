import path from 'node:path';
import { containedStrictly } from '../path-containment.js';
import { revealPath } from './navigation.js';
import { openOrRetargetLocalAt, type OpenPort } from './open.js';
import { localCloneOf } from '../plugins/origin-workspace-records.js';
import { nextRestoreRevision } from './restore.js';
import { isRemoteCacheFile, remoteFileFor } from './remote/file-cache.js';
import type { EditorView } from '../tab/types.js';
import type { NavigationPort } from './port.js';

// The navigator root and tree-relative path an edited file is revealed at. `file` and `root` are
// absolute — `file` is the editor's path, `root` is the tab manager's launch directory — and
// `clone` is the caller's `localCloneOf(file)` answer, so this rule never looks the clone up
// itself. It is lexical — `path.relative` only, no existence check and no `realpath` — so a
// symlinked path is judged by the string the tab holds, as `localCloneOf` judges it.
//
// The clone is checked first because the workspaces directory sits inside the project root. A file
// strictly under the root then roots at the root, and anything else roots at its own directory, so
// it stays a top-level row with nothing to expand. The clone is trusted rather than re-tested:
// `localCloneOf` is its only producer.
export function revealTargetFor(
  file: string,
  { clone, root }: { clone: string | undefined; root: string },
): { navigatorRoot: string; relPath: string } {
  if (clone !== undefined) return targetUnder(clone, file);
  if (containedStrictly(root, file)) return targetUnder(root, file);
  return { navigatorRoot: path.dirname(file), relPath: path.basename(file) };
}

// A tree-relative path, in the POSIX form the navigator's rows carry. Never empty for a file: the
// clone and root cases are strict, and the fallback's root is the file's own directory.
function targetUnder(navigatorRoot: string, file: string): { navigatorRoot: string; relPath: string } {
  return {
    navigatorRoot,
    relPath: path.relative(navigatorRoot, file).split(path.sep).join(path.posix.sep),
  };
}

// Why an editor cannot be revealed in a file navigator, or nothing when it can. `'unsaved'` wins
// over `'no-route'`: a new file has no path any navigator could find. A cached remote copy whose
// record is gone has no route back to its remote — the same predicate pair `saveFile` refuses an
// orphaned remote save with.
export function editorRevealBlocked(editor: EditorView): EditorView['revealBlocked'] {
  if (editor.newFile) return 'unsaved';
  if (isRemoteCacheFile(editor.path) && !remoteFileFor(editor.path)) return 'no-route';
  return undefined;
}

export type RevealPort = OpenPort & Pick<NavigationPort, 'setCwd' | 'hasTab' | 'reportFailure'>;

export function revealEditorFile(port: RevealPort, editorLabel: string): void {
  const editor = port.managers.tab.byLabel(editorLabel)?.editor;
  if (!editor || editorRevealBlocked(editor) !== undefined) return;
  if (isRemoteCacheFile(editor.path) && remoteFileFor(editor.path)) return;
  const { navigatorRoot, relPath } = revealTargetFor(editor.path, {
    clone: localCloneOf(editor.path),
    root: port.managers.tab.launchDir,
  });
  const label = openOrRetargetLocalAt(port, navigatorRoot);
  if (label === undefined) return;
  revealPath(port, label, relPath);
  const state = port.states.get(label);
  if (!state) return;
  state.restore = {
    revision: nextRestoreRevision(),
    cursor: relPath,
    anchor: relPath,
    selected: [relPath],
  };
  port.rebuild(label);
  const index = port.managers.tab.findIndex(label);
  if (port.managers.tab.tabs[index]?.dock === undefined) port.managers.tab.setActiveTab(index);
}
