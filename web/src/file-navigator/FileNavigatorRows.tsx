import React from 'react';
import type { FileNavigatorView } from '@shared/protocol';
import { FileNavigatorRowView } from './FileNavigatorRowView';
import { fileNavigatorRowClass } from './file-navigator-row-class';
import type { useFileNavigatorDrag } from './useFileNavigatorDrag';
import type { useFileNavigatorPaste } from './useFileNavigatorPaste';
import type { useFileNavigatorRename } from './useFileNavigatorRename';
import type { useFileNavigatorSelection } from './useFileNavigatorSelection';
import type { useFileNavigatorRowEvents } from './use-file-navigator-row-events';
import type { useSelectionAction } from './useSelectionAction';

type Properties = {
  files: FileNavigatorView;
  treeId: string;
  selection: ReturnType<typeof useFileNavigatorSelection>;
  drag: ReturnType<typeof useFileNavigatorDrag>;
  paste: ReturnType<typeof useFileNavigatorPaste>;
  rename: ReturnType<typeof useFileNavigatorRename>;
  rowEvents: ReturnType<typeof useFileNavigatorRowEvents>;
  selectionAction: ReturnType<typeof useSelectionAction>;
};

export function FileNavigatorRows({
  files, treeId, selection, drag, paste, rename, rowEvents, selectionAction,
}: Properties) {
  if (files.waitingFor !== undefined) {
    return <div className="files-waiting">Looking for {files.waitingFor}…</div>;
  }
  return (
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
          onClick={() => rowEvents.onRowClick(row)}
          onDoubleClick={(shiftKey) => rowEvents.onRowDoubleClick(row, shiftKey)}
          onMouseDown={(event) => rowEvents.onRowMouseDown(row, event)}
          onContextMenu={(event) => {
            // Only a menu raised on a row inside a multi-row selection can carry an entry that
            // acts on the whole selection; every other menu asks nothing and shows none.
            selectionAction.query(
              selection.selected.has(row.path) ? selection.operationPaths : [],
            );
            rowEvents.onRowContextMenu(row, event);
          }}
        />
      ))}
    </div>
  );
}
