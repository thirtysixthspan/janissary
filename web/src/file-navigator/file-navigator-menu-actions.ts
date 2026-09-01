import type { FileNavigatorRow, FileNavigatorView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { setClipboard } from './file-navigator-clipboard';
import { newFileTargetDir, newFileCommand, newDirectoryCommand, newDirectoryTargetPath } from './file-navigator-new-file';
import { normalizeOperationPaths, type useFileNavigatorSelection } from './useFileNavigatorSelection';
import type { FileNavigatorMenuActions } from './file-navigator-menu-items';
import type { useFileNavigatorIntents } from './useFileNavigatorIntents';
import type { useFileNavigatorOpener } from './useFileNavigatorOpener';
import type { useFileNavigatorPaste } from './useFileNavigatorPaste';
import type { useFileNavigatorDelete } from './useFileNavigatorDelete';
import type { useFileNavigatorRename } from './useFileNavigatorRename';
import type { useFileNavigatorRowEvents } from './use-file-navigator-row-events';

type Params = {
  files: FileNavigatorView;
  client: JanusClient;
  index: number;
  intents: ReturnType<typeof useFileNavigatorIntents>;
  selection: ReturnType<typeof useFileNavigatorSelection>;
  opener: ReturnType<typeof useFileNavigatorOpener>;
  paste: ReturnType<typeof useFileNavigatorPaste>;
  deletion: ReturnType<typeof useFileNavigatorDelete>;
  rename: ReturnType<typeof useFileNavigatorRename>;
  rowEvents: ReturnType<typeof useFileNavigatorRowEvents>;
  // Which paths Open and Edit fan out over when the clicked row belongs to the multi-row
  // selection, already resolved by the app shell's classifier — null when it does not apply.
  multiOpenSelection: string[] | null;
  setPendingNewDir: (path: string | null) => void;
};

// What the tab keeps hold of after the menu table is built: the three entry points its header,
// keyboard chords, and navigation actions still call directly.
export type FileNavigatorActions = {
  editFile: (path: string) => void;
  createNewFile: () => void;
  createNewDirectory: () => void;
  clipboardPaths: () => string[];
  beginRename: (row: FileNavigatorRow) => void;
  menuActions: FileNavigatorMenuActions;
};

// A remote tree has no shell to run a command in, so every creation and edit it makes travels as a
// protocol call; a local one goes through the command line the same way a typed command would, so
// the action lands in history beside the user's own.
export function createFileNavigatorActions({
  files, client, index, intents, selection, opener, paste, deletion, rename, rowEvents,
  multiOpenSelection, setPendingNewDir,
}: Params): FileNavigatorActions {
  const editFile = (path: string) => files.remote
    ? client.send({ method: 'fileNavigatorOpen', params: { index, relPath: path, command: 'edit' } })
    : intents.sendCommand(`edit ${files.absoluteRoot}/${path}`);

  const createNewFile = () => {
    const destination = newFileTargetDir(files.rows, selection.cursor) ?? '';
    if (files.remote) {
      client.send({ method: 'fileNavigatorCreateFile', params: { index, destination } });
      return;
    }
    const text = newFileCommand(files.absoluteRoot, destination || null);
    intents.sendCommand(text);
  };

  const createNewDirectory = () => {
    const targetDir = newFileTargetDir(files.rows, selection.cursor);
    setPendingNewDir(newDirectoryTargetPath(targetDir));
    if (files.remote) {
      client.send({ method: 'fileNavigatorCreateDirectory', params: { index, destination: targetDir ?? '' } });
      return;
    }
    intents.sendCommand(newDirectoryCommand(files.absoluteRoot, targetDir));
  };

  const beginRename = (row: FileNavigatorRow) => rename.begin(row.path, row.name);
  const clipboardPaths = () => selection.operationPaths.map((relPath) => `${files.absoluteRoot}/${relPath}`);

  const menuActions: FileNavigatorMenuActions = {
    open: (row) => {
      if (multiOpenSelection?.includes(row.path)) for (const path of multiOpenSelection) opener.open(path, false);
      else rowEvents.onRowDoubleClick(row, false);
    },
    edit: (row) => {
      if (multiOpenSelection?.includes(row.path)) for (const path of multiOpenSelection) editFile(path);
      else editFile(row.path);
    },
    openWith: (row) => opener.openWith(
      row.path,
      selection.selected.has(row.path) ? selection.operationPaths : [row.path],
    ),
    copy: (row) => setClipboard('copy', [`${files.absoluteRoot}/${row.path}`], files.remote?.host),
    paste: (row) => paste.paste(files.rows, row.path),
    duplicate: (row) => paste.duplicate(row),
    rename: beginRename,
    remove: (row) => deletion.request(
      selection.selected.has(row.path)
        ? selection.operationPaths
        : normalizeOperationPaths(files.rows, new Set([row.path])),
    ),
    newFile: createNewFile,
    newDirectory: createNewDirectory,
  };

  return { editFile, createNewFile, createNewDirectory, clipboardPaths, beginRename, menuActions };
}
