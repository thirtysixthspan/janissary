import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { displayLine } from '../api';
import { ClipboardHistoryPopup } from './Popup';
import { createClipboardHistoryPlugin } from './index';
import { createClipboardHistoryStore, type ClipboardHistoryRow } from './store';
import type { OverlayPluginCapabilities, OverlayPluginModule } from '../api';

const disposePlugins: (() => void)[] = [];

afterEach(() => {
  while (disposePlugins.length > 0) disposePlugins.pop()?.();
});

function row(id: string, text: string): ClipboardHistoryRow {
  return { id, text, ...displayLine(text) };
}

describe('the clipboard-history popup', () => {
  it('says what it is, and shows the empty state when there is nothing to paste', () => {
    render(<ClipboardHistoryPopup rows={[]} selected={0} choose={vi.fn()} />);
    expect(screen.getByText('clipboard')).toBeTruthy();
    expect(screen.getByText('(no clipboard history)')).toBeTruthy();
  });

  it('lists one line per entry, newest at the bottom', () => {
    render(<ClipboardHistoryPopup rows={[row('1', 'first'), row('2', 'second')]} selected={1} choose={vi.fn()} />);
    expect(screen.getAllByText(/first|second/).map((node) => node.textContent)).toEqual(['first', 'second']);
  });

  it('shows the display line and its multiline count separately', () => {
    render(<ClipboardHistoryPopup rows={[row('1', '  the first line\nand the second')]} selected={0} choose={vi.fn()} />);
    expect(screen.getByText('the first line').className).toContain('clipboard-history-label');
    expect(screen.getByText('(2 lines)').className).toContain('clipboard-history-lines');
  });

  it('shows no line count for a single-line entry', () => {
    const { container } = render(
      <ClipboardHistoryPopup rows={[row('1', 'just one line')]} selected={0} choose={vi.fn()} />,
    );
    expect(container.querySelector('.clipboard-history-lines')).toBeNull();
  });

  it('puts a long line in a label that truncates, rather than on the shared row', () => {
    const text = 'a line far longer than any picker is wide, and then some more after it';
    render(<ClipboardHistoryPopup rows={[row('1', text)]} selected={0} choose={vi.fn()} />);
    const label = screen.getByText(/far longer than any picker/).closest('span');
    expect(label?.className).toContain('clipboard-history-label');
    expect(screen.getByText(/far longer than any picker/).closest('.picker-row')?.className)
      .toContain('clipboard-history-row');
  });

  it('pastes the full text of a clicked row, not its display line or line count', () => {
    const text = '  the first line\nand the second';
    const choose = vi.fn();
    render(<ClipboardHistoryPopup rows={[row('1', text)]} selected={0} choose={choose} />);
    fireEvent.click(screen.getByText('(2 lines)'));
    expect(choose).toHaveBeenCalledWith(text);
  });

  it('marks the selected row', () => {
    render(<ClipboardHistoryPopup rows={[row('1', 'first'), row('2', 'second')]} selected={1} choose={vi.fn()} />);
    expect(screen.getByText('second').closest('.picker-row')?.className).toContain('selected');
    expect(screen.getByText('first').closest('.picker-row')?.className).not.toContain('selected');
  });

  it('takes the keyboard as it appears', () => {
    const { container } = render(
      <ClipboardHistoryPopup rows={[row('1', 'first')]} selected={0} choose={vi.fn()} />,
    );
    expect(document.activeElement).toBe(container.querySelector('.clipboard-history'));
  });
});

describe('the clipboard-history module', () => {
  function started() {
    const store = createClipboardHistoryStore();
    const plugin: OverlayPluginModule = createClipboardHistoryPlugin(store);
    const paste = vi.fn();
    const close = vi.fn();
    const capabilities: OverlayPluginCapabilities = { paste, maxEntries: 4, close };
    const overlay = plugin.start(capabilities);
    disposePlugins.push(plugin.dispose);
    return { overlay, plugin, store, paste, close };
  }

  it('pastes at the anchor it was handed and closes', () => {
    const { overlay, store, paste, close } = started();
    const anchor = document.createElement('div');
    store.record('chosen text');
    render(overlay.render(anchor));
    fireEvent.click(screen.getByText('chosen text'));
    expect(paste).toHaveBeenCalledWith('chosen text', anchor);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('claims the command bar while open, and selects the newest row when it opens', () => {
    const { overlay, store } = started();
    store.record('first');
    store.record('second');
    expect(overlay.claimsCommandBar).toBe(true);
    act(() => overlay.onOpen());
    render(overlay.render(null));
    expect(screen.getByText('second').closest('.picker-row')?.className).toContain('selected');
  });

  it('moves the selection with the arrows, clamped at both ends', () => {
    const { overlay, store } = started();
    store.record('first');
    store.record('second');
    act(() => overlay.onOpen());
    render(overlay.render(null));
    act(() => overlay.onKey(new KeyboardEvent('keydown', { key: 'ArrowUp' })));
    expect(screen.getByText('first').closest('.picker-row')?.className).toContain('selected');
    act(() => overlay.onKey(new KeyboardEvent('keydown', { key: 'ArrowUp' })));
    expect(screen.getByText('first').closest('.picker-row')?.className).toContain('selected');
    act(() => overlay.onKey(new KeyboardEvent('keydown', { key: 'ArrowDown' })));
    expect(screen.getByText('second').closest('.picker-row')?.className).toContain('selected');
  });

  it('pastes the selected entry on Return and closes only once per key', () => {
    const { overlay, store, paste, close } = started();
    store.record('chosen text');
    act(() => overlay.onOpen());
    render(overlay.render(null));
    act(() => overlay.onKey(new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(paste).toHaveBeenCalledWith('chosen text', null);
    expect(close).toHaveBeenCalledTimes(1);
    act(() => overlay.onKey(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('closes on Tab without pasting and prevents browser focus movement', () => {
    const { overlay, store, paste, close } = started();
    store.record('chosen text');
    act(() => overlay.onOpen());
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    act(() => overlay.onKey(tab));
    expect(close).toHaveBeenCalledOnce();
    expect(paste).not.toHaveBeenCalled();
    expect(tab.defaultPrevented).toBe(true);
  });

  it('leaves Shift+Tab alone', () => {
    const { overlay, close } = started();
    act(() => overlay.onKey(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true })));
    expect(close).not.toHaveBeenCalled();
  });

  it('empties the instance on dispose and can start it again', () => {
    const { plugin, store } = started();
    store.record('before dispose');
    expect(store.getRows()).toHaveLength(1);
    plugin.dispose();
    plugin.dispose();
    expect(store.getRows()).toEqual([]);
    const restarted = plugin.start({ paste: vi.fn(), maxEntries: 4, close: vi.fn() });
    restarted.onOpen();
    expect(store.getSelection()).toBe(0);
  });
});
