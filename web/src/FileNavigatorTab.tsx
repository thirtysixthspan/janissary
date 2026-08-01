import React, { useEffect, useId, useRef, useState } from 'react';
import type { FileNavigatorRow } from '@shared/protocol';
import { useFileNavigatorDrag } from './useFileNavigatorDrag';
import { useFileNavigatorRename } from './useFileNavigatorRename';
import { FileNavigatorRowView } from './FileNavigatorRowView';
import { fileNavigatorRowClass } from './file-navigator-row-class';
import { newFileTargetDir, newFileCommand, newDirectoryCommand, newDirectoryTargetPath, findPendingNewDir } from './file-navigator-new-file';
import { useFileNavigatorSearch } from './useFileNavigatorSearch';
import { FileNavigatorHeader } from './FileNavigatorHeader';
import { useFileNavigatorOpener } from './useFileNavigatorOpener';
import { useFileNavigatorDelete } from './useFileNavigatorDelete';
import { useFileNavigatorKeyDown } from './useFileNavigatorKeyDown';
import { useFileNavigatorPaste } from './useFileNavigatorPaste';
import { setClipboard } from './file-navigator-clipboard';
import { normalizeOperationPaths, useFileNavigatorSelection } from './useFileNavigatorSelection';
import { FileNavigatorOverlays } from './FileNavigatorOverlays';
import type { FileNavigatorTabProperties as Properties } from './file-navigator-tab-types';

const MARKDOWN_EXTENSION = /\.(md|markdown)$/i;

export function FileNavigatorTab({
  files, client, index, dock, autoFocus = true, dropRef, editorDropRef,
  targetCwd = files.absoluteRoot, onSplit,
}: Properties) {
  const selection = useFileNavigatorSelection(files.rows, files.absoluteRoot, index, files.restore);
  const [pendingNewDir, setPendingNewDir] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerHandledRef = useRef<string | null>(null);
  const treeId = useId();
  const drag = useFileNavigatorDrag(
    files.rows, client, index, files.absoluteRoot, files.root, targetCwd, dropRef, editorDropRef,
  );
  const rename = useFileNavigatorRename(
    files.rows, client, index, selection.rename, () => containerRef.current?.focus(),
  );
  const search = useFileNavigatorSearch(
    client, index, files.rows, selection.replace, () => containerRef.current?.focus(),
  );
  const opener = useFileNavigatorOpener(client, index, files.absoluteRoot);
  const deletion = useFileNavigatorDelete(client, index);
  const paste = useFileNavigatorPaste(client, index, files.absoluteRoot);

  useEffect(() => { if (autoFocus) containerRef.current?.focus(); }, [autoFocus]);

  // Scroll the selected row into view (nearest block alignment avoids unnecessary scroll
  // when the element is already fully visible).
  useEffect(() => {
    if (selection.cursor === null) return;
    containerRef.current?.querySelector(`[data-path="${CSS.escape(selection.cursor)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selection.cursor]);

  // New-directory auto-rename: once the directory created by `createNewDirectory` shows up at its
  // guessed path (the OS-level watcher rebuild that already brings any newly created row into
  // view), select it and open its rename field. A name collision server-side (the guessed path
  // doesn't match the actual created name) just means this never fires for that creation — see the
  // plan's accepted limitation.
  useEffect(() => {
    const row = findPendingNewDir(files.rows, pendingNewDir);
    if (!row) return;
    selection.replace(row.path);
    rename.begin(row.path, row.name);
    setPendingNewDir(null);
  }, [files.rows, pendingNewDir]); // eslint-disable-line react-hooks/exhaustive-deps -- `rename` is fresh each render

  const toggle = (path: string) => client.send({ method: 'fileNavigatorToggle', params: { index, path } });
  const openFile = (path: string, edit: boolean) => opener.open(path, edit);
  const editFile = (path: string) => client.send({ method: 'command', params: { text: `edit ${files.absoluteRoot}/${path}` } });
  const reroot = () => client.send({ method: 'fileNavigatorReroot', params: { index } });
  const rerootTo = (path: string) => client.send({ method: 'fileNavigatorReroot', params: { index, path } });
  const createNewFile = () => {
    const text = newFileCommand(newFileTargetDir(files.rows, selection.cursor));
    client.send({ method: 'command', params: { text } });
  };
  const createNewDirectory = () => {
    const targetDir = newFileTargetDir(files.rows, selection.cursor);
    setPendingNewDir(newDirectoryTargetPath(targetDir));
    client.send({ method: 'command', params: { text: newDirectoryCommand(targetDir) } });
  };

  const onRowMouseDown = (row: FileNavigatorRow, event: React.MouseEvent) => {
    if (event.button !== 0) return;
    if (event.target instanceof HTMLElement && event.target.closest('.files-rename-input')) return;
    pointerHandledRef.current = row.path;
    const modified = event.shiftKey || event.metaKey || event.ctrlKey;
    const keepSelection = !modified && selection.selected.has(row.path) && row.path !== '..';
    const next = keepSelection
      ? selection
      : selection.pointer(row.path, event.shiftKey, event.metaKey || event.ctrlKey);
    const sourcePaths = files.rows.map((candidate) => candidate.path)
      .filter((path) => path !== '..' && next.selected.has(path));
    drag.onRowMouseDown(row, event, sourcePaths, normalizeOperationPaths(files.rows, next.selected));
    containerRef.current?.focus();
  };
  const onRowClick = (row: FileNavigatorRow) => {
    if (pointerHandledRef.current === row.path) pointerHandledRef.current = null;
    else selection.replace(row.path);
    containerRef.current?.focus();
  };

  const onRowDoubleClick = (row: FileNavigatorRow, shiftKey: boolean) => {
    if (row.path === '..') reroot();
    else if (row.dir) toggle(row.path);
    else openFile(row.path, MARKDOWN_EXTENSION.test(row.path) !== shiftKey);
  };
  const beginRename = (row: FileNavigatorRow) => rename.begin(row.path, row.name);
  const clipboardPaths = () => selection.operationPaths.map((relPath) => `${files.absoluteRoot}/${relPath}`);

  const onKeyDown = useFileNavigatorKeyDown({
    rows: files.rows,
    selection,
    opener,
    rename,
    deletion,
    containerRef,
    chordHandlers: {
      sendUndo: () => void drag.sendUndo(),
      sendRedo: () => void drag.sendRedo(),
      createNewFile,
      beginRename,
      copySelection: () => setClipboard('copy', clipboardPaths()),
      cutSelection: () => setClipboard('cut', clipboardPaths()),
      paste: () => paste.paste(files.rows, selection.cursor),
    },
    actions: { reroot, rerootTo, toggle, openFile, editFile },
  });

  return (
    <div
      className="files-tab"
      data-doc-shot="file-navigator-view"
      ref={containerRef}
      tabIndex={0}
      role="tree"
      aria-multiselectable="true"
      aria-activedescendant={selection.cursor === null
        ? undefined
        : `${treeId}-row-${files.rows.findIndex((row) => row.path === selection.cursor)}`}
      onKeyDown={onKeyDown}
    >
      <FileNavigatorHeader
        root={files.root} branch={files.branch} githubUrl={files.githubUrl}
        client={client} index={index} dock={dock} details={files.details}
        onSearch={search.openSearch} onNewFile={createNewFile} onNewDirectory={createNewDirectory}
        onSplit={onSplit}
      />
      {files.waitingFor !== undefined && (
        <div className="files-waiting">Looking for {files.waitingFor}…</div>
      )}
      <div className="files-rows">
        {files.rows.map((row, rowIndex) => (
          <FileNavigatorRowView
            key={row.path}
            id={`${treeId}-row-${rowIndex}`}
            row={row}
            details={files.details}
            selected={selection.selected.has(row.path)}
            cursor={selection.cursor === row.path}
            rowClass={fileNavigatorRowClass(
              row,
              selection.selected.has(row.path),
              selection.cursor === row.path,
              drag.dropTarget?.path,
              paste.clipboardMark(row.path),
            )}
            editing={rename.editing === row.path}
            draft={rename.draft}
            onDraftChange={rename.setDraft}
            onCommit={rename.commit}
            onCancel={rename.cancel}
            onClick={() => onRowClick(row)}
            onDoubleClick={(shiftKey) => onRowDoubleClick(row, shiftKey)}
            onMouseDown={(event) => onRowMouseDown(row, event)}
          />
        ))}
      </div>
      <FileNavigatorOverlays
        drag={drag}
        rename={rename}
        deletion={deletion}
        paste={paste}
        search={search}
        opener={opener}
        focusTree={() => containerRef.current?.focus()}
      />
    </div>
  );
}
