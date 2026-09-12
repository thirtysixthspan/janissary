import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DefaultContextMenu } from './DefaultContextMenu';

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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('DefaultContextMenu', () => {
  it('offers Copy and Paste when a right-click lands in a field with text selected', () => {
    stubSelection('selected text');
    render(<DefaultContextMenu />);
    const event = rightClick(field());
    expect(labels()).toEqual(['Copy', 'Paste']);
    expect(event.defaultPrevented).toBe(true);
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
    expect(labels()).toEqual(['Chat about this', 'Copy', 'Paste']);

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
