import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { FileTreeView, FileTreeRow } from '@shared/protocol';
import type { JanusClient } from './ws';
import { handleFileTreeKey, typeAheadMatch } from './file-tree-keys';
import { useFileTreeDrag } from './useFileTreeDrag';
import { fileTreeRowClass } from './file-tree-row-class';
import { newFileTargetDir, newFileCommand } from './file-tree-new-file';
import { expandedIcon, collapsedIcon } from './icons';
import { MoveConflictDialog } from './MoveConflictDialog/MoveConflictDialog';
import { DeleteFileDialog } from './DeleteFileDialog';
import { FileSearchPopup } from './FileSearchPopup';
import { useFileTreeSearch } from './useFileTreeSearch';
import { FileTreeHeader } from './FileTreeHeader';
import type { CommandInputDropHandle } from './CommandInput';

type Properties = {
  files: FileTreeView;
  client: JanusClient;
  index: number;
  // The tab's current dock location (undefined means center). Drives the location-cycle
  // button's destination.
  dock?: 'left' | 'right';
  // Whether the tree grabs keyboard focus on mount. True for a center tab (the default); false
  // for a sidebar mount, where stealing focus would yank it away from the command bar every time
  // a dock move remounts the tree.
  autoFocus?: boolean;
  // The active tab's command bar imperative handle — only ever passed when this tree is docked
  // into a sidebar, where another tab's command bar can be a valid drop target alongside it.
  // Omitted for a center-mounted tree, which per Decision 4 never has a reachable command-bar
  // target regardless.
  dropRef?: React.RefObject<CommandInputDropHandle | null>;
};

const TYPEAHEAD_RESET_MS = 700;
const ROW_HEIGHT_PX = 22;
// Printable, unmodified single characters — used for type-ahead. Excludes space (the action key).
const PRINTABLE = /^[ -~]$/;
const MARKDOWN_EXTENSION = /\.(md|markdown)$/i;

export function FileTreeTab({ files, client, index, dock, autoFocus = true, dropRef }: Properties) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef<{ buffer: string; timer?: ReturnType<typeof setTimeout> }>({ buffer: '' });
  const drag = useFileTreeDrag(files.rows, client, index, dropRef);
  const search = useFileTreeSearch(client, index, files.rows, setSelected, () => containerRef.current?.focus());

  useEffect(() => { if (autoFocus) containerRef.current?.focus(); }, [autoFocus]);

  // Scroll the selected row into view (nearest block alignment avoids unnecessary scroll
  // when the element is already fully visible).
  useEffect(() => {
    if (selected === null) return;
    containerRef.current?.querySelector(`[data-path="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  // Selection clamp: if the selected row disappears (a watcher-driven rebuild), move to the
  // nearest surviving row instead of pointing at nothing.
  useEffect(() => {
    if (selected !== null && files.rows.every((r) => r.path !== selected)) {
      setSelected(files.rows[0]?.path ?? null);
    }
  }, [files.rows, selected]);

  const toggle = (path: string) => client.send({ method: 'fileTreeToggle', params: { index, path } });
  const openFile = (path: string) => client.send({ method: 'command', params: { text: `open ${path}` } });
  const editFile = (path: string) => client.send({ method: 'command', params: { text: `edit ${path}` } });
  const reroot = () => client.send({ method: 'fileTreeReroot', params: { index } });
  const rerootTo = (path: string) => client.send({ method: 'fileTreeReroot', params: { index, path } });
  const createNewFile = () => {
    const text = newFileCommand(newFileTargetDir(files.rows, selected));
    client.send({ method: 'command', params: { text } });
  };

  const onRowClick = (row: FileTreeRow) => {
    setSelected(row.path);
    containerRef.current?.focus();
  };

  const onRowDoubleClick = (row: FileTreeRow, shiftKey: boolean) => {
    if (row.path === '..') reroot();
    else if (row.dir) toggle(row.path);
    else if (MARKDOWN_EXTENSION.test(row.path) === shiftKey) openFile(row.path);
    else editFile(row.path);
  };

  const runAction = (action: { type: 'toggle' | 'open' | 'edit' | 'reroot'; path: string } | undefined) => {
    if (!action) return;
    switch (action.type) {
      case 'reroot': { if (action.path === '..') reroot(); else rerootTo(action.path); break; }
      case 'toggle': { toggle(action.path); break; }
      case 'open': { openFile(action.path); break; }
      case 'edit': { editFile(action.path); break; }
    }
  };

  const confirmDelete = () => {
    if (pendingDelete) client.send({ method: 'deleteFileTreeItem', params: { index, relPath: pendingDelete } });
    setPendingDelete(null);
  };

  const cancelDelete = () => setPendingDelete(null);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) void drag.sendRedo(); else void drag.sendUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      e.stopPropagation();
      createNewFile();
      return;
    }
    if (e.ctrlKey || e.metaKey) return; // tab-management chords go to the window handler
    if ((e.key === 'Backspace' || e.key === 'Delete') && selected && selected !== '..') {
      e.preventDefault();
      e.stopPropagation();
      setPendingDelete(selected);
      return;
    }
    const navKeys = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', ' ']);
    if (navKeys.has(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      const pageSize = Math.max(1, Math.floor((containerRef.current?.clientHeight ?? ROW_HEIGHT_PX * 10) / ROW_HEIGHT_PX));
      const result = handleFileTreeKey(files.rows, selected, e.key, e.shiftKey, pageSize);
      setSelected(result.selection);
      runAction(result.action);
      return;
    }
    if (PRINTABLE.test(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      const state = typeahead.current;
      clearTimeout(state.timer);
      state.buffer += e.key;
      const match = typeAheadMatch(files.rows, state.buffer);
      if (match) setSelected(match);
      state.timer = setTimeout(() => { state.buffer = ''; }, TYPEAHEAD_RESET_MS);
    }
  };

  return (
    <div className="files-tab" data-doc-shot="file-tree-view" ref={containerRef} tabIndex={0} role="tree" onKeyDown={onKeyDown}>
      <FileTreeHeader
        root={files.root} branch={files.branch} client={client} index={index} dock={dock}
        onSearch={search.openSearch} onNewFile={createNewFile}
      />
      <div className="files-rows">
        {files.rows.map((row) => {
          const cls = fileTreeRowClass(row, selected, drag.dropTarget?.path);
          return (
            <div
              key={row.path}
              role="treeitem"
              aria-selected={row.path === selected}
              aria-expanded={row.dir ? !!row.expanded : undefined}
              className={cls.row}
              data-path={row.path}
              style={{ paddingLeft: 12 + row.depth * 16 }}
              onClick={() => onRowClick(row)}
              onDoubleClick={(e) => onRowDoubleClick(row, e.shiftKey)}
              onMouseDown={(e) => drag.onRowMouseDown(row, e)}
            >
              {row.dir && row.expanded !== undefined && <span className="files-chevron"><FontAwesomeIcon icon={row.expanded ? expandedIcon : collapsedIcon} /></span>}
              <span className={cls.name}>{row.name}</span>
            </div>
          );
        })}
      </div>
      {drag.draggedPath && drag.dragPosition && (
        <div
          className="files-drag-ghost"
          style={{ left: drag.dragPosition.x, top: drag.dragPosition.y }}
        >
          {drag.draggedPath.slice(drag.draggedPath.lastIndexOf('/') + 1)}
        </div>
      )}
      {drag.pendingConflict && (
        <MoveConflictDialog
          name={drag.pendingConflict.fromRelPath.slice(drag.pendingConflict.fromRelPath.lastIndexOf('/') + 1)}
          onOverwrite={drag.confirmOverwrite}
          onCancel={drag.cancelConflict}
        />
      )}
      {pendingDelete && (
        <DeleteFileDialog
          name={pendingDelete.slice(pendingDelete.lastIndexOf('/') + 1)}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
      {search.searchOpen && (
        <FileSearchPopup
          query={search.searchQuery}
          onChangeQuery={search.setSearchQuery}
          paths={search.searchPaths}
          loading={search.searchLoading}
          onReveal={search.revealFromSearch}
          onClose={search.closeSearch}
        />
      )}
    </div>
  );
}
