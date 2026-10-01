import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import module from './index';
import { record } from './store';
import { createPasteCapability } from '../../paste-into-surface';
import { closeContributedOverlay, isContributedOverlayOpen, openContributedOverlay, registerContributedOverlay } from '../../shared/contributed-overlays';
import { registerEditorDrop } from '../../shared/drop-registry';
import { registerTerminalSelection, unregisterTerminalSelection } from '../../shared/terminal/terminal/selection';
import type { JanusClient } from '../../ws';

// The whole route from a chosen row to the surface the user was typing in: the plugin's module, the
// seam it registers on, and the paste capability the app shell injects, with nothing stubbed between
// them. Each piece has its own tests; this file exists because the bug it pins lived in how they
// meet. The popup takes the keyboard, so the paste has to land where the keyboard was before it did.

const PLUGIN = 'clipboard-history';
const teardown: (() => void)[] = [];

afterEach(() => {
  while (teardown.length > 0) teardown.pop()?.();
  document.body.replaceChildren();
});

function editorBuffer(label: string) {
  const body = document.createElement('div');
  body.dataset.editorDrop = label;
  const textarea = document.createElement('textarea');
  body.append(textarea);
  document.body.append(body);
  const pasteAtCaret = vi.fn();
  teardown.push(registerEditorDrop(label, { insertAtCaret: vi.fn(), pasteAtCaret }));
  return { textarea, pasteAtCaret };
}

function noTab(): TabView | undefined {
  return undefined;
}

// Starts the plugin as the host would, with the real paste capability, and opens its overlay from the
// element that holds the keyboard now — which is what a chord pressed there does.
function openFrom(
  origin: HTMLElement,
  currentTab: () => TabView | undefined = noTab,
  focusHarness: (ptyId: string) => void = () => {},
) {
  const client = { send: vi.fn() } as unknown as JanusClient;
  const paste = createPasteCapability({ client, dropRef: { current: null }, currentTab, focusHarness });
  const overlay = module.start({ paste, maxEntries: 15, close: () => { closeContributedOverlay(PLUGIN); } });
  teardown.push(() => { module.dispose(); }, registerContributedOverlay(overlay));
  origin.focus();
  act(() => { openContributedOverlay(PLUGIN, null); });
  const view = render(overlay.render(null));
  teardown.push(view.unmount);
  return { overlay, client };
}

describe('pasting into an editor buffer from a popup opened by its chord', () => {
  it('pastes the chosen entry on Return and gives the keyboard back to the buffer', () => {
    const { textarea, pasteAtCaret } = editorBuffer('notes');
    const { overlay } = openFrom(textarea);
    act(() => { record('chosen text'); });
    expect(document.activeElement).toBe(document.querySelector('.clipboard-history'));

    act(() => { overlay.onKey(new KeyboardEvent('keydown', { key: 'Enter' })); });

    expect(pasteAtCaret).toHaveBeenCalledWith('chosen text');
    expect(isContributedOverlayOpen(PLUGIN)).toBe(false);
    expect(document.activeElement).toBe(textarea);
  });

  it('pastes a clicked entry into the buffer too', () => {
    const { textarea, pasteAtCaret } = editorBuffer('notes');
    openFrom(textarea);
    act(() => { record('clicked text'); });

    fireEvent.click(screen.getByText('clicked text'));

    expect(pasteAtCaret).toHaveBeenCalledWith('clicked text');
    expect(isContributedOverlayOpen(PLUGIN)).toBe(false);
    expect(document.activeElement).toBe(textarea);
  });
});

describe('pasting into a harness terminal', () => {
  function harnessTab(): TabView {
    return { label: 'harness', view: 'harness', harness: { ptyId: 'pty-9' } } as unknown as TabView;
  }

  // What a mounted harness looks like to the paste route: a registered terminal container holding
  // xterm's hidden input, which is the element that has the keyboard while the user types at the prompt.
  function terminal() {
    const container = document.createElement('div');
    const input = document.createElement('textarea');
    container.append(input);
    document.body.append(container);
    registerTerminalSelection(container, { hasSelection: () => false, getSelection: () => '', clear: () => {} });
    teardown.push(() => { unregisterTerminalSelection(container); });
    return input;
  }

  it('types the entry at the prompt and leaves the keyboard in the terminal it had', () => {
    const input = terminal();
    const { overlay, client } = openFrom(input, harnessTab);
    act(() => { record('ls -la'); });

    act(() => { overlay.onKey(new KeyboardEvent('keydown', { key: 'Enter' })); });

    expect(client.send).toHaveBeenCalledWith({ method: 'ptyInput', params: { id: 'pty-9', data: 'ls -la' } });
    expect(document.activeElement).toBe(input);
  });

  it('puts the keyboard on the terminal even when it was somewhere else as the popup opened', () => {
    const input = terminal();
    const outside = document.createElement('button');
    document.body.append(outside);
    const focusHarness = vi.fn(() => { input.focus(); });
    const { overlay } = openFrom(outside, harnessTab, focusHarness);
    act(() => { record('ls -la'); });

    act(() => { overlay.onKey(new KeyboardEvent('keydown', { key: 'Enter' })); });

    expect(focusHarness).toHaveBeenCalledWith('pty-9');
    expect(document.activeElement).toBe(input);
  });
});
