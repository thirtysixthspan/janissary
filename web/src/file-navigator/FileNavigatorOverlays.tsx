import React from 'react';
import { MoveConflictDialog } from '../MoveConflictDialog/MoveConflictDialog';
import { DeleteFileDialog } from '../DeleteFileDialog';
import { FileSearchPopup } from '../FileSearchPopup';
import { FileNavigatorOpenerOverlay } from './FileNavigatorOpenerOverlay';
import type { useFileNavigatorDrag } from './useFileNavigatorDrag';
import type { useFileNavigatorRename } from './useFileNavigatorRename';
import type { useFileNavigatorDelete } from './useFileNavigatorDelete';
import type { useFileNavigatorPaste } from './useFileNavigatorPaste';
import type { useFileNavigatorSearch } from './useFileNavigatorSearch';
import type { useFileNavigatorOpener } from './useFileNavigatorOpener';
import type { PendingContextMenu } from './use-file-navigator-row-events';
import { ContextMenu } from '../ContextMenu';
import { fileNavigatorMenuItems, type FileNavigatorMenuActions } from './file-navigator-menu-items';
import { getClipboardSnapshot } from './file-navigator-clipboard';
import { basename } from '../rel-path';

type Properties = {
  drag: ReturnType<typeof useFileNavigatorDrag>;
  rename: ReturnType<typeof useFileNavigatorRename>;
  deletion: ReturnType<typeof useFileNavigatorDelete>;
  paste: ReturnType<typeof useFileNavigatorPaste>;
  search: ReturnType<typeof useFileNavigatorSearch>;
  opener: ReturnType<typeof useFileNavigatorOpener>;
  menu: PendingContextMenu | null;
  menuActions: FileNavigatorMenuActions;
  // The plugin-contributed selection entry for the open menu, already bound to the selection it acts
  // on, or nothing when the selection resolves to no such entry.
  selectionEntry?: { label: string; onActivate: () => void } | null;
  onCloseMenu: () => void;
  focusTree: () => void;
};

export function FileNavigatorOverlays({
  drag,
  rename,
  deletion,
  paste,
  search,
  opener,
  menu,
  menuActions,
  selectionEntry,
  onCloseMenu,
  focusTree,
}: Properties) {
  return (
    <>
      {drag.draggedPath && drag.dragPosition && (
        <div
          className="files-drag-ghost"
          style={{ left: drag.dragPosition.x, top: drag.dragPosition.y }}
        >
          {basename(drag.draggedPath)}
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
            ? basename(deletion.pendingDelete[0])
            : undefined}
          count={deletion.pendingDelete.length > 1 ? deletion.pendingDelete.length : undefined}
          onConfirm={() => { deletion.confirm(); focusTree(); }}
          onCancel={() => { deletion.cancel(); focusTree(); }}
        />
      )}
      {opener.pending && (
        <FileNavigatorOpenerOverlay pending={opener.pending} onPick={opener.choose} />
      )}
      {menu && (
        <ContextMenu
          groups={fileNavigatorMenuItems(
            menu.row, getClipboardSnapshot() !== null, menuActions, selectionEntry,
          )}
          x={menu.x}
          y={menu.y}
          onClose={() => { onCloseMenu(); focusTree(); }}
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
    </>
  );
}
