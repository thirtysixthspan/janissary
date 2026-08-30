import React, { useEffect, useId, useRef, useState } from 'react';
import type { FileNavigatorRow } from '@shared/protocol';
import { useFileNavigatorDrag } from './useFileNavigatorDrag';
import { useFileNavigatorRename } from './useFileNavigatorRename';
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
import { useSelectionAction } from '../useSelectionAction';
import { useFileNavigatorRowEvents } from './use-file-navigator-row-events';
import type { FileNavigatorMenuActions } from './file-navigator-menu-items';
import type { FileNavigatorTabProperties as Properties } from './file-navigator-tab-types';
import { useFileNavigatorIntents } from './useFileNavigatorIntents';
import { nextDock } from '../dock-cycle';
import { FileNavigatorRows } from './FileNavigatorRows';

export function FileNavigatorTab({
  files, client, index, dock, autoFocus = true, dropRef, editorDropRef,
  targetCwd = files.absoluteRoot, onSplit, multiOpen,
}: Properties) {
  const intents = useFileNavigatorIntents(client, index);
  const selection = useFileNavigatorSelection(files.rows, files.absoluteRoot, index, files.restore);
  const [pendingNewDir, setPendingNewDir] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const treeId = useId();
  const drag = useFileNavigatorDrag(
    files.rows, client, index, files.absoluteRoot, files.root, targetCwd, dropRef, editorDropRef, files.remote?.host,
  );
  const rename = useFileNavigatorRename(
    files.rows, client, index, selection.rename, () => containerRef.current?.focus(),
  );
  const search = useFileNavigatorSearch(
    client, index, files.rows, selection.replace, () => containerRef.current?.focus(),
  );
  const opener = useFileNavigatorOpener(client, index, files.absoluteRoot, files.remote !== undefined);
  const deletion = useFileNavigatorDelete(client, index);
  const paste = useFileNavigatorPaste(client, index, files.absoluteRoot, files.remote?.host);
  const selectionAction = useSelectionAction(client, index);
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

  const toggle = intents.toggle;
  const openFile = (path: string, edit: boolean) => opener.open(path, edit);
  const editFile = (path: string) => files.remote
    ? client.send({ method: 'fileNavigatorOpen', params: { index, relPath: path, command: 'edit' } })
    : intents.sendCommand(`edit ${files.absoluteRoot}/${path}`);
  const reroot = intents.reroot;
  const rerootTo = intents.rerootTo;
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

  const rowEvents = useFileNavigatorRowEvents({
    rows: files.rows,
    selection,
    drag,
    containerRef,
    actions: { reroot, toggle, openFile },
  });
  const multiOpenSelection = multiOpen?.(selection.operationPaths) ?? null;
  const beginRename = (row: FileNavigatorRow) => rename.begin(row.path, row.name);
  const clipboardPaths = () => selection.operationPaths.map((relPath) => `${files.absoluteRoot}/${relPath}`);
  const menuActions: FileNavigatorMenuActions = {
    open: (row) => {
      if (multiOpenSelection?.includes(row.path)) for (const path of multiOpenSelection) openFile(path, false);
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
      copySelection: () => setClipboard('copy', clipboardPaths(), files.remote?.host),
      cutSelection: () => setClipboard('cut', clipboardPaths(), files.remote?.host),
      paste: () => paste.paste(files.rows, selection.cursor),
      selectSiblings: selection.selectSiblings,
    },
    actions: { reroot, rerootTo, toggle, openFile, editFile },
  });

  return (
    <div
      className="files-tab"
      data-doc-shot="file-navigator-view"
      data-files-host={files.remote?.host ?? ''}
      data-files-root={files.absoluteRoot}
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
        root={files.root} remote={files.remote} branch={files.branch} githubUrl={files.githubUrl}
        dock={dock} details={files.details}
        onOpenGithub={intents.openGithub}
        onCycleDock={dock === undefined ? undefined : () => intents.setDock(nextDock(dock))}
        onSetDetail={intents.setDetail} onCollapseAll={intents.collapseAll}
        onSearch={search.openSearch} onNewFile={createNewFile} onNewDirectory={createNewDirectory}
        onSplit={onSplit}
      />
      <FileNavigatorRows
        files={files} treeId={treeId} selection={selection} drag={drag} paste={paste}
        rename={rename} rowEvents={rowEvents} selectionAction={selectionAction}
      />
      <FileNavigatorOverlays
        drag={drag}
        rename={rename}
        deletion={deletion}
        paste={paste}
        search={search}
        opener={opener}
        menu={rowEvents.menu}
        menuActions={menuActions}
        selectionEntry={!files.remote && selectionAction.entry ? {
          label: selectionAction.entry.label,
          onActivate: () => { selectionAction.run(selection.operationPaths); },
        } : undefined}
        onCloseMenu={() => { selectionAction.clear(); rowEvents.closeMenu(); }}
        focusTree={() => containerRef.current?.focus()}
      />
    </div>
  );
}
