import React from 'react';
import { MoveConflictDialog } from './MoveConflictDialog/MoveConflictDialog';
import { DeleteFileDialog } from './DeleteFileDialog';
import { FileSearchPopup } from './FileSearchPopup';
import { FileNavigatorOpenerOverlay } from './FileNavigatorOpenerOverlay';
import type { useFileNavigatorDrag } from './useFileNavigatorDrag';
import type { useFileNavigatorRename } from './useFileNavigatorRename';
import type { useFileNavigatorDelete } from './useFileNavigatorDelete';
import type { useFileNavigatorPaste } from './useFileNavigatorPaste';
import type { useFileNavigatorSearch } from './useFileNavigatorSearch';
import type { useFileNavigatorOpener } from './useFileNavigatorOpener';

type Properties = {
  drag: ReturnType<typeof useFileNavigatorDrag>;
  rename: ReturnType<typeof useFileNavigatorRename>;
  deletion: ReturnType<typeof useFileNavigatorDelete>;
  paste: ReturnType<typeof useFileNavigatorPaste>;
  search: ReturnType<typeof useFileNavigatorSearch>;
  opener: ReturnType<typeof useFileNavigatorOpener>;
  focusTree: () => void;
};

export function FileNavigatorOverlays({
  drag,
  rename,
  deletion,
  paste,
  search,
  opener,
  focusTree,
}: Properties) {
  return (
    <>
      {drag.draggedPath && drag.dragPosition && (
        <div
          className="files-drag-ghost"
          style={{ left: drag.dragPosition.x, top: drag.dragPosition.y }}
        >
          {drag.draggedPath.slice(drag.draggedPath.lastIndexOf('/') + 1)}
          {drag.draggedCount > 1 ? ` +${drag.draggedCount - 1}` : ''}
        </div>
      )}
      {drag.pendingConflict && (
        <MoveConflictDialog
          title={drag.pendingConflict.title}
          onOverwrite={drag.confirmOverwrite}
          onSkip={drag.pendingConflict.kind === 'scalar' ? undefined : drag.skipConflicts}
          onCancel={drag.cancelConflict}
        />
      )}
      {rename.pendingConflict && (
        <MoveConflictDialog
          name={rename.pendingConflict.newName}
          onOverwrite={rename.confirmOverwrite}
          onCancel={rename.cancelConflict}
        />
      )}
      {paste.pendingConflict && (
        <MoveConflictDialog
          title={paste.pendingConflict.title}
          onOverwrite={paste.confirmOverwrite}
          onSkip={paste.pendingConflict.sources.length > 1 ? paste.skipConflicts : undefined}
          onCancel={paste.cancelConflict}
        />
      )}
      {deletion.pendingDelete && (
        <DeleteFileDialog
          name={deletion.pendingDelete.length === 1
            ? deletion.pendingDelete[0].slice(deletion.pendingDelete[0].lastIndexOf('/') + 1)
            : undefined}
          count={deletion.pendingDelete.length > 1 ? deletion.pendingDelete.length : undefined}
          onConfirm={() => { deletion.confirm(); focusTree(); }}
          onCancel={() => { deletion.cancel(); focusTree(); }}
        />
      )}
      {opener.pending && (
        <FileNavigatorOpenerOverlay pending={opener.pending} onPick={opener.choose} />
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
    </>
  );
}
