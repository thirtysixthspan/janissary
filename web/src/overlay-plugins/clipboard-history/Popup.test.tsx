import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClipboardHistoryPopup } from './Popup';
import { disposeHistory, record, selectNewest, setSelection } from './store';
import module from './index';
import type { OverlayPluginCapabilities } from '../api';

afterEach(() => {
  disposeHistory();
});

describe('the clipboard-history popup', () => {
  it('says what it is, and shows the empty state when there is nothing to paste', () => {
    render(<ClipboardHistoryPopup choose={vi.fn()} />);
    expect(screen.getByText('clipboard')).toBeTruthy();
    expect(screen.getByText('(no clipboard history)')).toBeTruthy();
  });

  it('lists one line per entry, newest at the bottom', () => {
    record('first');
    record('second');
    render(<ClipboardHistoryPopup choose={vi.fn()} />);
    expect(screen.getAllByText(/first|second/).map((node) => node.textContent)).toEqual(['first', 'second']);
  });

  it('shows the display line, with the ellipsis the derivation adds', () => {
    record('  the first line\nand the second');
    render(<ClipboardHistoryPopup choose={vi.fn()} />);
    expect(screen.getByText('the first line…')).toBeTruthy();
  });

  // Truncation lives on the label rather than on `.picker-row`, because a row is a flex container and
  // `text-overflow` does not reach the anonymous flex item a bare text child becomes. A shared rule on
  // the row would also change how the other thirteen overlays render long labels.
  it('puts a long line in a label that truncates, rather than on the shared row', () => {
    record('a line far longer than any picker is wide, and then some more after it');
    render(<ClipboardHistoryPopup choose={vi.fn()} />);

    const label = screen.getByText(/far longer than any picker/).closest('span');
    expect(label?.className).toContain('clipboard-history-label');
    expect(screen.getByText(/far longer than any picker/).closest('.picker-row')?.className)
      .toContain('clipboard-history-row');
  });

  it('pastes the full text of a clicked row, not the line it displays', () => {
    record('  the first line\nand the second');
    const choose = vi.fn();
    render(<ClipboardHistoryPopup choose={choose} />);

    fireEvent.click(screen.getByText('the first line…'));

    expect(choose).toHaveBeenCalledWith('  the first line\nand the second');
  });

  it('marks the selected row, and the newest is selected on open', () => {
    record('first');
    record('second');
    selectNewest();
    render(<ClipboardHistoryPopup choose={vi.fn()} />);
    expect(screen.getByText('second').closest('.picker-row')?.className).toContain('selected');
    expect(screen.getByText('first').closest('.picker-row')?.className).not.toContain('selected');

    // The store is the selection's only home, so the popup re-renders as it moves.
    act(() => setSelection(0));
    expect(screen.getByText('first').closest('.picker-row')?.className).toContain('selected');
  });

  it('adds a copy made while it is open', () => {
    render(<ClipboardHistoryPopup choose={vi.fn()} />);
    expect(screen.getByText('(no clipboard history)')).toBeTruthy();
    act(() => record('copied after opening'));
    expect(screen.getByText('copied after opening')).toBeTruthy();
  });
});

describe('the clipboard-history module', () => {
  function started() {
    const paste = vi.fn();
    const close = vi.fn();
    const capabilities: OverlayPluginCapabilities = { paste, maxEntries: 4, close };
    return { overlay: module.start(capabilities), paste, close };
  }

  it('pastes at the anchor it was handed and closes', () => {
    const { overlay, paste, close } = started();
    const anchor = document.createElement('div');
    record('chosen text');

    render(overlay.render(anchor));
    fireEvent.click(screen.getByText('chosen text'));

    expect(paste).toHaveBeenCalledWith('chosen text', anchor);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('claims the command bar while open, and selects the newest row when it opens', () => {
    const { overlay } = started();
    record('first');
    record('second');
    expect(overlay.claimsCommandBar).toBe(true);

    act(() => overlay.onOpen());
    render(overlay.render(null));
    expect(screen.getByText('second').closest('.picker-row')?.className).toContain('selected');
  });

  it('moves the selection with the arrows, clamped at both ends', () => {
    const { overlay } = started();
    record('first');
    record('second');
    act(() => overlay.onOpen());
    render(overlay.render(null));

    act(() => overlay.onKey(new KeyboardEvent('keydown', { key: 'ArrowUp' })));
    expect(screen.getByText('first').closest('.picker-row')?.className).toContain('selected');
    act(() => overlay.onKey(new KeyboardEvent('keydown', { key: 'ArrowUp' })));
    expect(screen.getByText('first').closest('.picker-row')?.className).toContain('selected');

    act(() => overlay.onKey(new KeyboardEvent('keydown', { key: 'ArrowDown' })));
    expect(screen.getByText('second').closest('.picker-row')?.className).toContain('selected');
  });

  // Return and Escape both close, so the shared handler does the closing and `paste` does not — a
  // Return that closed twice was a real bug this pair exists to catch.
  it('pastes the selected entry on Return, and closes on Return and on Escape alike', () => {
    const { overlay, paste, close } = started();
    record('chosen text');
    act(() => overlay.onOpen());
    render(overlay.render(null));

    act(() => overlay.onKey(new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(paste).toHaveBeenCalledWith('chosen text', null);
    expect(close).toHaveBeenCalledTimes(1);

    act(() => overlay.onKey(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('empties itself on dispose, releasing what it recorded', () => {
    started();
    record('before dispose');
    expect(screen.queryByText('before dispose')).toBeNull();
    act(() => module.dispose());
    record('after dispose');
    expect(screen.queryByText('after dispose')).toBeNull();
  });
});
