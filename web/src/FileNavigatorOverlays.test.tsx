import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FileNavigatorOverlays } from './FileNavigatorOverlays';
import type { useFileNavigatorDrag } from './useFileNavigatorDrag';
import type { useFileNavigatorRename } from './useFileNavigatorRename';
import type { useFileNavigatorDelete } from './useFileNavigatorDelete';
import type { useFileNavigatorPaste } from './useFileNavigatorPaste';
import type { useFileNavigatorSearch } from './useFileNavigatorSearch';
import type { useFileNavigatorOpener } from './useFileNavigatorOpener';
import type { FileNavigatorMenuActions } from './file-navigator-menu-items';

type Drag = ReturnType<typeof useFileNavigatorDrag>;
type Rename = ReturnType<typeof useFileNavigatorRename>;
type Deletion = ReturnType<typeof useFileNavigatorDelete>;
type Paste = ReturnType<typeof useFileNavigatorPaste>;
type Search = ReturnType<typeof useFileNavigatorSearch>;
type Opener = ReturnType<typeof useFileNavigatorOpener>;

function makeDrag(overrides: Partial<Drag> = {}): Drag {
  return {
    draggedPath: null,
    draggedCount: 0,
    dragPosition: null,
    dropTarget: null,
    onRowMouseDown: () => {},
    drop: () => {},
    pendingConflict: null,
    requestMove: () => {},
    sendUndo: () => Promise.resolve(),
    sendRedo: () => Promise.resolve(),
    confirmOverwrite: () => {},
    skipConflicts: () => {},
    cancelConflict: () => {},
    ...overrides,
  };
}

function makeRename(overrides: Partial<Rename> = {}): Rename {
  return {
    editing: null,
    draft: '',
    setDraft: () => {},
    begin: () => {},
    commit: () => {},
    cancel: () => {},
    pendingConflict: null,
    confirmOverwrite: () => {},
    cancelConflict: () => {},
    ...overrides,
  };
}

function makeDeletion(overrides: Partial<Deletion> = {}): Deletion {
  return {
    pendingDelete: null,
    request: () => {},
    confirm: () => {},
    cancel: () => {},
    ...overrides,
  };
}

function makePaste(overrides: Partial<Paste> = {}): Paste {
  return {
    pendingConflict: null,
    paste: () => {},
    confirmOverwrite: () => {},
    skipConflicts: () => {},
    cancelConflict: () => {},
    clipboardMark: () => null,
    ...overrides,
  };
}

function makeSearch(overrides: Partial<Search> = {}): Search {
  return {
    searchOpen: false,
    searchQuery: '',
    setSearchQuery: () => {},
    searchLoading: false,
    searchPaths: [],
    openSearch: () => {},
    closeSearch: () => {},
    revealFromSearch: () => {},
    ...overrides,
  };
}

function makeOpener(overrides: Partial<Opener> = {}): Opener {
  return {
    pending: null,
    open: () => {},
    openWith: () => {},
    choose: () => {},
    onKeyDown: () => false,
    ...overrides,
  };
}

function makeMenuActions(): FileNavigatorMenuActions {
  return {
    open: () => {},
    edit: () => {},
    openWith: () => {},
    copy: () => {},
    paste: () => {},
    rename: () => {},
    remove: () => {},
    newFile: () => {},
    newDirectory: () => {},
  };
}

describe('FileNavigatorOverlays', () => {
  it('renders nothing when there is nothing to show', () => {
    const { container } = render(
      <FileNavigatorOverlays
        drag={makeDrag()}
        rename={makeRename()}
        deletion={makeDeletion()}
        paste={makePaste()}
        search={makeSearch()}
        opener={makeOpener()}
        menu={null}
        menuActions={makeMenuActions()}
        onCloseMenu={() => {}}
        focusTree={() => {}}
      />,
    );
    expect(container.textContent).toBe('');
  });

  it('confirms the delete dialog and refocuses the tree', () => {
    const confirm = vi.fn();
    const focusTree = vi.fn();
    render(
      <FileNavigatorOverlays
        drag={makeDrag()}
        rename={makeRename()}
        deletion={makeDeletion({ pendingDelete: ['notes.txt'], confirm })}
        paste={makePaste()}
        search={makeSearch()}
        opener={makeOpener()}
        menu={null}
        menuActions={makeMenuActions()}
        onCloseMenu={() => {}}
        focusTree={focusTree}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(focusTree).toHaveBeenCalledTimes(1);
  });

  it('cancels the delete dialog and refocuses the tree', () => {
    const cancel = vi.fn();
    const focusTree = vi.fn();
    render(
      <FileNavigatorOverlays
        drag={makeDrag()}
        rename={makeRename()}
        deletion={makeDeletion({ pendingDelete: ['notes.txt'], cancel })}
        paste={makePaste()}
        search={makeSearch()}
        opener={makeOpener()}
        menu={null}
        menuActions={makeMenuActions()}
        onCloseMenu={() => {}}
        focusTree={focusTree}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(focusTree).toHaveBeenCalledTimes(1);
  });

  it('a single-item paste conflict renders MoveConflictDialog without a Skip option', () => {
    render(
      <FileNavigatorOverlays
        drag={makeDrag()}
        rename={makeRename()}
        deletion={makeDeletion()}
        paste={makePaste({ pendingConflict: { sources: ['/a/b.txt'], destinationPath: 'dest', mode: 'copy', title: 'conflict!' } })}
        search={makeSearch()}
        opener={makeOpener()}
        menu={null}
        menuActions={makeMenuActions()}
        onCloseMenu={() => {}}
        focusTree={() => {}}
      />,
    );
    expect(screen.getByText('conflict!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument();
  });

  it('a multi-item paste conflict offers Skip conflicts', () => {
    const skipConflicts = vi.fn();
    render(
      <FileNavigatorOverlays
        drag={makeDrag()}
        rename={makeRename()}
        deletion={makeDeletion()}
        paste={makePaste({
          pendingConflict: { sources: ['/a/b.txt', '/a/c.txt'], destinationPath: 'dest', mode: 'copy', title: 'conflict!' },
          skipConflicts,
        })}
        search={makeSearch()}
        opener={makeOpener()}
        menu={null}
        menuActions={makeMenuActions()}
        onCloseMenu={() => {}}
        focusTree={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(skipConflicts).toHaveBeenCalledTimes(1);
  });

  const menuRow = { path: 'a.mp3', name: 'a.mp3', depth: 0, dir: false };

  function renderMenu(selectionEntry?: { label: string; onActivate: () => void } | null) {
    return render(
      <FileNavigatorOverlays
        drag={makeDrag()}
        rename={makeRename()}
        deletion={makeDeletion()}
        paste={makePaste()}
        search={makeSearch()}
        opener={makeOpener()}
        menu={{ row: menuRow, x: 10, y: 10 }}
        menuActions={makeMenuActions()}
        selectionEntry={selectionEntry}
        onCloseMenu={() => {}}
        focusTree={() => {}}
      />,
    );
  }

  it('renders a contributed selection entry in the row menu and activates it', () => {
    const onActivate = vi.fn();
    renderMenu({ label: 'Add to playlist', onActivate });
    fireEvent.click(screen.getByText('Add to playlist'));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('renders the ordinary row entries unchanged when nothing is contributed', () => {
    renderMenu(null);
    expect(screen.queryByText('Add to playlist')).toBeNull();
    for (const label of ['Open', 'Edit', 'Open with', 'Copy', 'Delete', 'New file']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
