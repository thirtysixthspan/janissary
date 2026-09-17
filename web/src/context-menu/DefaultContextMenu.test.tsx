import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DefaultContextMenu } from './DefaultContextMenu';
import { registerTerminalSelection, unregisterTerminalSelection } from '../shared/terminal/terminal-selection';

function stubSelection(text: string) {
  vi.spyOn(globalThis, 'getSelection').mockReturnValue({ toString: () => text } as Selection);
}

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText, readText: () => Promise.resolve('') } });
  return writeText;
}

// A surface with a menu of its own answers the right-click before this one sees it, which is what
// `preventDefault()` on the event means here — the file navigator's rows do exactly this.
function rightClick(element: Element, claimed = false) {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 });
  if (claimed) event.preventDefault();
  fireEvent(element, event);
  return event;
}

function field(): HTMLTextAreaElement {
  const element = document.createElement('textarea');
  document.body.append(element);
  element.focus();
  return element;
}

function labels(): string[] {
  return screen.queryAllByRole('menuitem').map((item) => item.textContent);
}

function deferredContribution() {
  let resolve!: (value: { label: string } | null) => void;
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web target excludes ES2024.
  const promise = new Promise<{ label: string } | null>((release) => { resolve = release; });
  return { promise, resolve };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('DefaultContextMenu', () => {
  it('stays closed when dismissed before its contribution reply resolves', async () => {
    stubSelection('dismissed selection');
    const reply = deferredContribution();
    const client = { request: vi.fn(() => reply.promise), send: vi.fn() };
    render(<DefaultContextMenu client={client as never} />);
    rightClick(field());
    expect(client.request).toHaveBeenCalledOnce();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await act(async () => { reply.resolve({ label: 'Chat about this' }); await reply.promise; });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(client.send).not.toHaveBeenCalled();
  });

  it('retains the newest contribution when two menu replies arrive in reverse order', async () => {
    const first = deferredContribution();
    const second = deferredContribution();
    const client = {
      request: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
      send: vi.fn(),
    };
    render(<DefaultContextMenu client={client as never} />);
    const element = field();
    stubSelection('old selection');
    rightClick(element);
    stubSelection('new selection');
    rightClick(element);
    expect(client.request).toHaveBeenNthCalledWith(1, {
      method: 'defaultMenuSelectionAction', params: { selection: 'old selection' },
    });
    expect(client.request).toHaveBeenNthCalledWith(2, {
      method: 'defaultMenuSelectionAction', params: { selection: 'new selection' },
    });
    await act(async () => { second.resolve({ label: 'Chat about this' }); await second.promise; });
    expect(labels()).toEqual(['Copy', 'Paste', 'Chat about this']);
    await act(async () => { first.resolve({ label: 'Stale action' }); await first.promise; });
    expect(labels()).toEqual(['Copy', 'Paste', 'Chat about this']);
    fireEvent.click(screen.getByText('Chat about this'));
    expect(client.send).toHaveBeenCalledExactlyOnceWith({
      method: 'runDefaultMenuSelectionAction',
      params: { selection: 'new selection', action: 'Chat about this' },
    });
  });

  it('makes no contribution request when a surface claims the menu', () => {
    stubSelection('claimed selection');
    const client = { request: vi.fn(), send: vi.fn() };
    render(<DefaultContextMenu client={client as never} />);
    rightClick(field(), true);
    expect(client.request).not.toHaveBeenCalled();
    expect(client.send).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps clipboard actions working on subsequent menus after a contribution becomes unavailable', async () => {
    stubSelection('selected text');
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue('clipboard text');
    vi.stubGlobal('navigator', { clipboard: { writeText, readText } });
    const client = {
      request: vi.fn().mockResolvedValueOnce({ label: 'Chat about this' }).mockResolvedValue(null),
      send: vi.fn(),
    };
    render(<DefaultContextMenu client={client as never} />);
    rightClick(field());
    await screen.findByText('Chat about this');
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await act(async () => { rightClick(field()); });
    expect(labels()).toEqual(['Copy', 'Paste']);
    fireEvent.click(screen.getByText('Copy'));
    expect(writeText).toHaveBeenCalledExactlyOnceWith('selected text');
    await act(async () => { rightClick(field()); });
    expect(labels()).toEqual(['Copy', 'Paste']);
    await act(async () => { fireEvent.click(screen.getByText('Paste')); });
    expect(readText).toHaveBeenCalledOnce();
    expect(client.send).not.toHaveBeenCalled();
  });

  it.each(['Copy', 'Paste'])('retains keyboard-selected %s when the contribution arrives', async (label) => {
    stubSelection('selected text');
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue('clipboard text');
    vi.stubGlobal('navigator', { clipboard: { writeText, readText } });
    const reply = deferredContribution();
    const client = { request: vi.fn(() => reply.promise), send: vi.fn() };
    render(<DefaultContextMenu client={client as never} />);
    rightClick(field());
    if (label === 'Paste') fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    await act(async () => { reply.resolve({ label: 'Chat about this' }); await reply.promise; });
    expect(labels()).toEqual(['Copy', 'Paste', 'Chat about this']);
    expect(screen.getByText(label)).toHaveClass('selected');
    await act(async () => { fireEvent.keyDown(screen.getByRole('menu'), { key: 'Enter' }); });
    expect(label === 'Copy' ? writeText : readText).toHaveBeenCalledOnce();
    expect(label === 'Copy' ? readText : writeText).not.toHaveBeenCalled();
    expect(client.send).not.toHaveBeenCalled();
  });

  it('offers Copy and Paste when a right-click lands in a field with text selected', () => {
    stubSelection('selected text');
    render(<DefaultContextMenu />);
    const event = rightClick(field());
    expect(labels()).toEqual(['Copy', 'Paste']);
    expect(event.defaultPrevented).toBe(true);
  });

  it('offers Copy, Paste, and the contributed action for an editor-owned selection', async () => {
    stubSelection('');
    const client = { request: vi.fn().mockResolvedValue({ label: 'Chat about this' }), send: vi.fn() };
    render(<DefaultContextMenu client={client as never} />);
    field();
    const editor = document.createElement('div');
    editor.dataset.editorSelection = 'editor selection';
    const line = document.createElement('span');
    editor.append(line);
    document.body.append(editor);
    rightClick(line);
    await screen.findByText('Chat about this');
    expect(client.request).toHaveBeenCalledWith({
      method: 'defaultMenuSelectionAction', params: { selection: 'editor selection' },
    });
    expect(labels()).toEqual(['Copy', 'Paste', 'Chat about this']);
  });

  it('offers only Paste for an editor with no selection', () => {
    stubSelection('');
    render(<DefaultContextMenu />);
    field();
    const editor = document.createElement('div');
    editor.dataset.editorSelection = '';
    const line = document.createElement('span');
    editor.append(line);
    document.body.append(editor);
    rightClick(line);
    expect(labels()).toEqual(['Paste']);
  });

  it('offers only Paste when nothing is selected', () => {
    stubSelection('');
    render(<DefaultContextMenu />);
    rightClick(field());
    expect(labels()).toEqual(['Paste']);
  });

  it('offers only Copy when the right-click reaches no field', () => {
    stubSelection('selected text');
    render(<DefaultContextMenu />);
    rightClick(document.body);
    expect(labels()).toEqual(['Copy']);
  });

  it('runs Chat about this with Cmd+I for the current selection', async () => {
    stubSelection('selected text');
    const client = { request: vi.fn().mockResolvedValue({ label: 'Chat about this' }), send: vi.fn() };
    render(<DefaultContextMenu client={client as never} />);
    const event = new KeyboardEvent('keydown', { key: 'i', metaKey: true, bubbles: true, cancelable: true });
    globalThis.dispatchEvent(event);
    await act(async () => {});
    expect(event.defaultPrevented).toBe(true);
    expect(client.request).toHaveBeenCalledWith({
      method: 'defaultMenuSelectionAction', params: { selection: 'selected text' },
    });
    expect(client.send).toHaveBeenCalledWith({
      method: 'runDefaultMenuSelectionAction',
      params: { selection: 'selected text', action: 'Chat about this' },
    });
  });

  it('leaves Cmd+I alone when nothing is selected', () => {
    stubSelection('');
    const client = { request: vi.fn(), send: vi.fn() };
    render(<DefaultContextMenu client={client as never} />);
    const event = new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, bubbles: true, cancelable: true });
    globalThis.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(client.request).not.toHaveBeenCalled();
    expect(client.send).not.toHaveBeenCalled();
  });

  it('opens nothing when a surface has already claimed the right-click', () => {
    stubSelection('selected text');
    render(<DefaultContextMenu />);
    rightClick(field(), true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('leaves the browser its own menu when neither entry applies', () => {
    stubSelection('');
    render(<DefaultContextMenu />);
    const event = rightClick(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(event.defaultPrevented).toBe(false);
  });

  it('writes the selected text to the clipboard when Copy is activated', () => {
    stubSelection('selected text');
    const writeText = stubClipboard();
    render(<DefaultContextMenu />);
    rightClick(field());
    fireEvent.click(screen.getByText('Copy'));
    expect(writeText).toHaveBeenCalledWith('selected text');
  });

  it('releases a terminal-sourced selection once Copy is activated', () => {
    const clear = vi.fn();
    const terminal = document.createElement('div');
    // Stands in for xterm's own focus target, which lives inside the container that gets
    // registered: `restoreFocus` resolves to whatever holds the keyboard, and that has to fall
    // inside the terminal for the registry to find it again.
    const focusTarget = document.createElement('textarea');
    terminal.append(focusTarget);
    document.body.append(terminal);
    focusTarget.focus();
    registerTerminalSelection(terminal, {
      hasSelection: () => true,
      getSelection: () => 'terminal text',
      clear,
    });
    try {
      const writeText = stubClipboard();
      render(<DefaultContextMenu />);
      rightClick(terminal);
      fireEvent.click(screen.getByText('Copy'));
      expect(writeText).toHaveBeenCalledWith('terminal text');
      expect(clear).toHaveBeenCalledOnce();
    } finally {
      unregisterTerminalSelection(terminal);
    }
  });

  it('leaves a dom selection alone once Copy is activated', () => {
    stubSelection('selected text');
    const writeText = stubClipboard();
    render(<DefaultContextMenu />);
    rightClick(field());
    fireEvent.click(screen.getByText('Copy'));
    expect(writeText).toHaveBeenCalledWith('selected text');
  });

  it('closes on Escape and gives focus back to the element the menu took it from', () => {
    stubSelection('');
    render(<DefaultContextMenu />);
    const element = field();
    rightClick(element);
    expect(document.activeElement).toBe(screen.getByRole('menu'));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(element);
  });

  it('stops answering right-clicks once it is unmounted', () => {
    stubSelection('selected text');
    const { unmount } = render(<DefaultContextMenu />);
    unmount();
    const event = rightClick(field());
    expect(event.defaultPrevented).toBe(false);
  });

  it('installs the contributed entry while the menu is open and runs it back through the run RPC', async () => {
    stubSelection('selected text');
    const client = { request: vi.fn().mockResolvedValue({ label: 'Chat about this' }), send: vi.fn() };
    const rendered = render(<DefaultContextMenu client={client as never} />);
    rightClick(field());
    const entry = await screen.findByText('Chat about this');
    expect(client.request).toHaveBeenCalledWith({
      method: 'defaultMenuSelectionAction', params: { selection: 'selected text' },
    });
    expect(labels()).toEqual(['Copy', 'Paste', 'Chat about this']);
    expect(screen.getByRole('menu').querySelectorAll('.context-menu-separator')).toHaveLength(1);

    fireEvent.click(entry);
    expect(client.send).toHaveBeenCalledWith({
      method: 'runDefaultMenuSelectionAction',
      params: { selection: 'selected text', action: 'Chat about this' },
    });
    expect(rendered.container.querySelector('[role="menu"]')).not.toBeInTheDocument();
  });

  it('omits it for selections with no contribution', async () => {
    stubSelection('selected text');
    const client = { request: vi.fn().mockResolvedValue(null), send: vi.fn() };
    render(<DefaultContextMenu client={client as never} />);
    rightClick(field());
    await screen.findByText('Copy');
    expect(labels()).toEqual(['Copy', 'Paste']);
  });

  it('asks again for the next menu and leaves a closed menu behind it unanswered', async () => {
    stubSelection('selected text');
    let answer: { label: string } | null = { label: 'Chat about this' };
    const client = {
      request: vi.fn(() => Promise.resolve(answer)),
      send: vi.fn(),
    };
    const rendered = render(<DefaultContextMenu client={client as never} />);
    rightClick(field());
    await screen.findByText('Chat about this');
    fireEvent.click(screen.getByText('Copy'));
    answer = null;
    stubSelection('');
    rightClick(field());
    await screen.findByText('Paste');
    stubSelection('selected text');
    rightClick(field());
    await screen.findByText('Copy');
    expect(labels()).toEqual(['Copy', 'Paste']);
    expect(rendered.container).toBeTruthy();
  });
});
