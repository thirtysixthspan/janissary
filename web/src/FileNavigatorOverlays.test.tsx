import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FileNavigatorOverlays } from './FileNavigatorOverlays';
import type { useFileNavigatorDrag } from './useFileNavigatorDrag';
import type { useFileNavigatorRename } from './useFileNavigatorRename';
import type { useFileNavigatorDelete } from './useFileNavigatorDelete';
import type { useFileNavigatorSearch } from './useFileNavigatorSearch';
import type { useFileNavigatorOpener } from './useFileNavigatorOpener';

type Drag = ReturnType<typeof useFileNavigatorDrag>;
type Rename = ReturnType<typeof useFileNavigatorRename>;
type Deletion = ReturnType<typeof useFileNavigatorDelete>;
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
    failure: null,
    requestMove: () => {},
    sendUndo: () => {},
    sendRedo: () => {},
    confirmOverwrite: () => {},
    skipConflicts: () => {},
    cancelConflict: () => {},
    dismissFailure: () => {},
    reportFailure: () => {},
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
    choose: () => {},
    onKeyDown: () => false,
    ...overrides,
  };
}

describe('FileNavigatorOverlays', () => {
  it('renders nothing when there is nothing to show', () => {
    const { container } = render(
      <FileNavigatorOverlays
        drag={makeDrag()}
        rename={makeRename()}
        deletion={makeDeletion()}
        search={makeSearch()}
        opener={makeOpener()}
        focusTree={() => {}}
      />,
    );
    expect(container.textContent).toBe('');
  });

  it('dismisses the failure dialog and refocuses the tree', async () => {
    const dismissFailure = vi.fn();
    const focusTree = vi.fn();
    render(
      <FileNavigatorOverlays
        drag={makeDrag({
          failure: { total: 2, failedPaths: ['a.txt', 'b.txt'], operation: 'move' },
          dismissFailure,
        })}
        rename={makeRename()}
        deletion={makeDeletion()}
        search={makeSearch()}
        opener={makeOpener()}
        focusTree={focusTree}
      />,
    );
    const dismissButton = screen.getByRole('button', { name: /ok|dismiss|close/i });
    fireEvent.click(dismissButton);
    expect(dismissFailure).toHaveBeenCalledTimes(1);
    expect(focusTree).toHaveBeenCalledTimes(1);
  });
});
