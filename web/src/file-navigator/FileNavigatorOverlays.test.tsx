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
import type { useFileNavigatorCommit } from './useFileNavigatorCommit';
import type { FileNavigatorMenuActions } from './file-navigator-menu-items';
import type { FileNavigatorRow } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { createFileNavigatorActions } from './file-navigator-menu-actions';
import { normalizeOperationPaths } from './useFileNavigatorSelection';

type Drag = ReturnType<typeof useFileNavigatorDrag>;
type Rename = ReturnType<typeof useFileNavigatorRename>;
type Deletion = ReturnType<typeof useFileNavigatorDelete>;
type Paste = ReturnType<typeof useFileNavigatorPaste>;
type Search = ReturnType<typeof useFileNavigatorSearch>;
type Opener = ReturnType<typeof useFileNavigatorOpener>;
type Commit = ReturnType<typeof useFileNavigatorCommit>;

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
    duplicate: () => {},
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

function makeCommit(overrides: Partial<Commit> = {}): Commit {
  return {
    pendingCommit: null,
    request: () => {},
    confirm: () => {},
    cancel: () => {},
    ...overrides,
  };
}

function makeMenuActions(overrides: Partial<FileNavigatorMenuActions> = {}): FileNavigatorMenuActions {
  return {
    open: () => {},
    edit: () => {},
    openWith: () => {},
    copy: () => {},
    copyFilePath: () => {},
    paste: () => {},
    duplicate: () => {},
    rename: () => {},
    remove: () => {},
    commitToOrigin: () => {},
    newFile: () => {},
    newDirectory: () => {},
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
        paste={makePaste()}
        search={makeSearch()}
        opener={makeOpener()}
        menu={null}
        commit={makeCommit()}
        menuActions={makeMenuActions()}
        hasBranch={false}
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
        commit={makeCommit()}
        menuActions={makeMenuActions()}
        hasBranch={false}
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
        commit={makeCommit()}
        menuActions={makeMenuActions()}
        hasBranch={false}
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
        commit={makeCommit()}
        menuActions={makeMenuActions()}
        hasBranch={false}
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
        commit={makeCommit()}
        menuActions={makeMenuActions()}
        hasBranch={false}
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
        commit={makeCommit()}
        menuActions={makeMenuActions()}
        hasBranch={false}
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

  // `file-navigator-menu-actions.ts` has no unit test file of its own — the entries it builds are
  // exercised through the rendered menu, here.
  const commitRows: FileNavigatorRow[] = [
    { path: 'src', name: 'src', depth: 0, dir: true, expanded: true },
    { path: 'src/a.ts', name: 'a.ts', depth: 1, dir: false },
    { path: 'src/b.ts', name: 'b.ts', depth: 1, dir: false },
    { path: 'README.md', name: 'README.md', depth: 0, dir: false },
  ];

  function renderCommitMenu(row: FileNavigatorRow, selected: string[]) {
    const request = vi.fn();
    const { menuActions } = createFileNavigatorActions({
      files: { root: '/ws', absoluteRoot: '/ws', rows: commitRows },
      client: { send: vi.fn() } as unknown as JanusClient,
      index: 0,
      label: 'files',
      selection: {
        selected: new Set(selected),
        operationPaths: normalizeOperationPaths(commitRows, new Set(selected)),
      } as never,
      opener: makeOpener(),
      paste: makePaste(),
      deletion: makeDeletion(),
      rename: makeRename(),
      rowEvents: {} as never,
      commit: makeCommit({ request }),
      multiOpenSelection: null,
      setPendingNewDir: () => {},
    });
    render(
      <FileNavigatorOverlays
        drag={makeDrag()}
        rename={makeRename()}
        deletion={makeDeletion()}
        paste={makePaste()}
        search={makeSearch()}
        opener={makeOpener()}
        menu={{ row, x: 10, y: 10 }}
        commit={makeCommit()}
        menuActions={menuActions}
        hasBranch
        onCloseMenu={() => {}}
        focusTree={() => {}}
      />,
    );
    return { request };
  }

  it('commits every selected row when the clicked row belongs to the selection', () => {
    const { request } = renderCommitMenu(commitRows[1], ['src/a.ts', 'src/b.ts']);
    fireEvent.click(screen.getByText('Commit to origin'));
    expect(request).toHaveBeenCalledWith(['src/a.ts', 'src/b.ts']);
  });

  it('commits the clicked row alone when it is outside the selection', () => {
    const { request } = renderCommitMenu(commitRows[3], ['src/a.ts', 'src/b.ts']);
    fireEvent.click(screen.getByText('Commit to origin'));
    expect(request).toHaveBeenCalledWith(['README.md']);
  });

  it('offers Commit to origin on a directory row, where Edit is not offered', () => {
    const { request } = renderCommitMenu(commitRows[0], []);
    expect(screen.queryByText('Edit')).toBeNull();
    fireEvent.click(screen.getByText('Commit to origin'));
    expect(request).toHaveBeenCalledWith(['src']);
  });

  function renderOverlays(commit: Commit) {
    return render(
      <FileNavigatorOverlays
        drag={makeDrag()}
        rename={makeRename()}
        deletion={makeDeletion()}
        paste={makePaste()}
        search={makeSearch()}
        opener={makeOpener()}
        menu={null}
        commit={commit}
        menuActions={makeMenuActions()}
        hasBranch={false}
        onCloseMenu={() => {}}
        focusTree={() => {}}
      />,
    );
  }

  it('re-primes the commit-message field with the new default when it is re-targeted while open', () => {
    const first = { id: 1, paths: ['notes.md'], defaultMessage: 'sync: notes.md', fileCount: 1 };
    const second = { id: 2, paths: [], defaultMessage: 'sync: 3 files', fileCount: 3 };
    const { rerender } = renderOverlays(makeCommit({ pendingCommit: first }));
    expect((screen.getByLabelText('Commit message') as HTMLInputElement).value).toBe('sync: notes.md');
    expect(screen.getByText('Commit message')).toBeInTheDocument();
    rerender(<FileNavigatorOverlays
      drag={makeDrag()}
      rename={makeRename()}
      deletion={makeDeletion()}
      paste={makePaste()}
      search={makeSearch()}
      opener={makeOpener()}
      menu={null}
      commit={makeCommit({ pendingCommit: second })}
      menuActions={makeMenuActions()}
      hasBranch={false}
      onCloseMenu={() => {}}
      focusTree={() => {}} />,);
    expect((screen.getByLabelText('Commit message') as HTMLInputElement).value).toBe('sync: 3 files');
    expect(screen.getByText('Commit message (3 files)')).toBeInTheDocument();
  });
});
