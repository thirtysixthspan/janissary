import type { FileNavigatorRow, FileNavigatorView } from '@shared/protocol';
import type { JanusClient } from '../../ws';
import { copyAbsolutePaths, copySelectionToClipboards } from './navigator-copy';
import { newFileTargetDir, newDirectoryTargetPath } from './navigator-new-file';
import { normalizeOperationPaths } from './navigator-selection';
import type { FileNavigatorMenuActions } from './navigator-menu-items';

type SelectionPort = {
  cursor: string | null;
  selected: Set<string>;
  operationPaths: string[];
};

type Params = {
  files: FileNavigatorView;
  client: JanusClient;
  index: number;
  label: string;
  selection: SelectionPort;
  opener: {
    open: (path: string, edit: boolean) => void;
    openWith: (path: string, paths?: string[]) => void;
  };
  paste: {
    paste: (rows: FileNavigatorRow[], cursor: string | null) => void;
    duplicate: (row: FileNavigatorRow) => void;
  };
  deletion: { request: (paths: string[]) => void };
  rename: { begin: (relPath: string, currentName: string) => void };
  rowEvents: { onRowDoubleClick: (row: FileNavigatorRow, shiftKey: boolean) => void };
  commit: { request: (paths: string[], defaultMessage?: string, fileCount?: number) => void };
  // Which paths Open and Edit fan out over when the clicked row belongs to the multi-row
  // selection, already resolved by the app shell's classifier — null when it does not apply.
  multiOpenSelection: string[] | null;
  setPendingNewDir: (path: string | null) => void;
};

// What the tab keeps hold of after the menu table is built: the three entry points its header and
// keyboard chords still call directly.
export type FileNavigatorActions = {
  createNewFile: () => void;
  createNewDirectory: () => void;
  clipboardPaths: () => string[];
  beginRename: (row: FileNavigatorRow) => void;
  menuActions: FileNavigatorMenuActions;
};

// Every edit travels as the navigator-scoped RPC: the server resolves it to the navigator's own
// label and root, so no command is issued and nothing lands in any tab's transcript, command
// history, or queue — local and remote trees alike. The two create requests change the filesystem,
// so they name the navigator by `label` rather than by tab index.
export function createFileNavigatorActions({
  files, client, index, label, selection, opener, paste, deletion, rename, rowEvents, commit,
  multiOpenSelection, setPendingNewDir,
}: Params): FileNavigatorActions {
  // The menu's own Edit entry asks for `edit` outright rather than consulting the opener registry
  // the way the row's activations do: this entry is the plain one, so a Markdown row reaches the
  // editor and an image the image editor, and a video is not handed to a player nobody asked for.
  const editFile = (path: string) =>
    client.send({ method: 'fileNavigatorOpen', params: { index, relPath: path, command: 'edit' } });

  const createNewFile = () => {
    const destination = newFileTargetDir(files.rows, selection.cursor) ?? '';
    client.send({ method: 'fileNavigatorCreateFile', params: { label, destination } });
  };

  const createNewDirectory = () => {
    const targetDir = newFileTargetDir(files.rows, selection.cursor);
    void client.request<string | undefined>({
      method: 'fileNavigatorCreateDirectory', params: { label, destination: targetDir ?? '' },
    }).then((result) => {
      if (result.ok && result.value === newDirectoryTargetPath(targetDir)) setPendingNewDir(result.value);
    });
  };

  const beginRename = (row: FileNavigatorRow) => rename.begin(row.path, row.name);
  const clipboardPaths = () => selection.operationPaths.map((relPath) => `${files.absoluteRoot}/${relPath}`);

  // What the two selection-scoped entries act on: the whole selection when the clicked row belongs
  // to it, the clicked row alone otherwise. Normalizing drops descendants of selected directories,
  // so selecting a folder and a file inside it names the folder once rather than naming the child
  // twice.
  const selectionOrRow = (row: FileNavigatorRow) => (selection.selected.has(row.path)
    ? selection.operationPaths
    : normalizeOperationPaths(files.rows, new Set([row.path])));

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
    copy: (row) => copySelectionToClipboards(files.absoluteRoot, [row.path], files.remote?.host),
    copyFilePath: (row) => copyAbsolutePaths(
      files.absoluteRoot,
      selection.selected.has(row.path) ? selection.operationPaths : [row.path],
      files.remote?.host,
    ),
    paste: (row) => paste.paste(files.rows, row.path),
    duplicate: (row) => paste.duplicate(row),
    rename: beginRename,
    remove: (row) => deletion.request(selectionOrRow(row)),
    commitToOrigin: (row) => commit.request(selectionOrRow(row)),
    newFile: createNewFile,
    newDirectory: createNewDirectory,
  };

  return { createNewFile, createNewDirectory, clipboardPaths, beginRename, menuActions };
}
