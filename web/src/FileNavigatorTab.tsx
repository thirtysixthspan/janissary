import React, { useEffect, useId, useRef, useState } from 'react';
import type { FileNavigatorRow } from '@shared/protocol';
import { handleFileNavigatorKey, typeAheadMatch } from './file-navigator-keys';
import { handleTreeChord } from './file-navigator-chords';
import { useFileNavigatorDrag } from './useFileNavigatorDrag';
import { useFileNavigatorRename } from './useFileNavigatorRename';
import { FileNavigatorRowView } from './FileNavigatorRowView';
import { fileNavigatorRowClass } from './file-navigator-row-class';
import { newFileTargetDir, newFileCommand, newDirectoryCommand, newDirectoryTargetPath, findPendingNewDir } from './file-navigator-new-file';
import { useFileNavigatorSearch } from './useFileNavigatorSearch';
import { FileNavigatorHeader } from './FileNavigatorHeader';
import { useFileNavigatorOpener } from './useFileNavigatorOpener';
import { useFileNavigatorDelete } from './useFileNavigatorDelete';
import { runFileNavigatorAction } from './file-navigator-actions';
import { normalizeOperationPaths, useFileNavigatorSelection } from './useFileNavigatorSelection';
import { FileNavigatorOverlays } from './FileNavigatorOverlays';
import type { FileNavigatorTabProperties as Properties } from './file-navigator-tab-types';

const TYPEAHEAD_RESET_MS = 700;
const ROW_HEIGHT_PX = 22;
// Printable, unmodified single characters — used for type-ahead. Excludes space (the action key).
const PRINTABLE = /^[ -~]$/;
const MARKDOWN_EXTENSION = /\.(md|markdown)$/i;

export function FileNavigatorTab({
  files, client, index, dock, autoFocus = true, dropRef, editorDropRef,
  targetCwd = files.absoluteRoot, onSplit,
}: Properties) {
  const selection = useFileNavigatorSelection(files.rows, files.absoluteRoot);
  const [pendingNewDir, setPendingNewDir] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerHandledRef = useRef<string | null>(null);
  const treeId = useId();
  const typeahead = useRef<{ buffer: string; timer?: ReturnType<typeof setTimeout> }>({ buffer: '' });
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
  const deletion = useFileNavigatorDelete(client, index, drag.reportFailure);

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

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLElement && e.target.closest('.files-rename-input')) return;
    if (opener.onKeyDown(e)) return;
    // While the rename field is open, its own Enter/Escape/typing handling in `InlineEditInput`
    // owns every keystroke; without this, those keydowns bubble here too and get double-handled
    // (e.g. Enter also re-triggering the tree's own "open selected row" navigation action).
    if (rename.editing !== null) return;
    if (e.ctrlKey || e.metaKey) {
      const handled = handleTreeChord(e.key, e.shiftKey, files.rows, selection.cursor, {
        sendUndo: () => void drag.sendUndo(),
        sendRedo: () => void drag.sendRedo(),
        createNewFile,
        beginRename,
      });
      if (handled) { e.preventDefault(); e.stopPropagation(); }
      return; // tab-management chords go to the window handler
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && selection.operationPaths.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      deletion.request(selection.operationPaths);
      return;
    }
    const navKeys = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', ' ']);
    if (navKeys.has(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      const pageSize = Math.max(1, Math.floor((containerRef.current?.clientHeight ?? ROW_HEIGHT_PX * 10) / ROW_HEIGHT_PX));
      const result = handleFileNavigatorKey(files.rows, selection.cursor, e.key, e.shiftKey, pageSize);
      selection.replace(result.selection);
      runFileNavigatorAction(result.action, { reroot: (path) => { if (path === '..') reroot(); else rerootTo(path); }, toggle, open: (path) => openFile(path, false), edit: editFile });
      return;
    }
    if (PRINTABLE.test(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      const state = typeahead.current;
      clearTimeout(state.timer);
      state.buffer += e.key;
      const match = typeAheadMatch(files.rows, state.buffer);
      if (match) selection.replace(match);
      state.timer = setTimeout(() => { state.buffer = ''; }, TYPEAHEAD_RESET_MS);
    }
  };

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
        root={files.root} branch={files.branch} githubUrl={files.githubUrl} client={client} index={index} dock={dock}
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
            selected={selection.selected.has(row.path)}
            cursor={selection.cursor === row.path}
            rowClass={fileNavigatorRowClass(
              row,
              selection.selected.has(row.path),
              selection.cursor === row.path,
              drag.dropTarget?.path,
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
        search={search}
        opener={opener}
        focusTree={() => containerRef.current?.focus()}
      />
    </div>
  );
}
