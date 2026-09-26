import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import type { HarnessView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { HarnessTab } from './harness/HarnessTab';
import { DefaultContextMenu } from './context-menu/DefaultContextMenu';

// The harness tab's Shift+drag selection and the app-level default context menu are two features
// the app shell mounts side by side, so the test that composes them lives at the shell level rather
// than inside either feature. xterm relies on canvas/WebGL, which jsdom lacks, so it is stubbed.

vi.mock('@xterm/xterm', () => {
  const Terminal = vi.fn();
  return { Terminal };
});

vi.mock('@xterm/addon-fit', () => {
  function FitAddon() { return { fit: vi.fn() }; }
  return { FitAddon };
});

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

const mockClient = {
  send: vi.fn(),
  attachPty: vi.fn(() => () => {}),
  request: vi.fn(),
} as unknown as JanusClient;

function makeHarness(): HarnessView {
  return { name: 'claude', program: 'claude', ptyId: 'pty-1', status: 'running' };
}

// The selection gesture over a surface whose container rect the tests provide, since jsdom lays
// nothing out: Shift+pointerdown, a window-level move, and a release.
function shiftDrag(host: Element, fromX: number, fromY: number, toX: number, toY: number): void {
  vi.spyOn(host as HTMLElement, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 480, width: 800, height: 480, toJSON: () => {},
  } as DOMRect);
  fireEvent.pointerDown(host, { clientX: fromX, clientY: fromY, button: 0, shiftKey: true });
  fireEvent.pointerMove(host, { clientX: toX, clientY: toY, button: 0, shiftKey: true });
  fireEvent.pointerUp(host, { clientX: toX, clientY: toY, button: 0, shiftKey: true });
}

// A harness like claude turns on mouse reporting the moment it starts. The Shift+drag selection
// layer is what picks its output now, and the default context menu is what acts on it.
describe('harness terminal selection with the default context menu', () => {
  let screenLines: string[];
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    screenLines = [];
    writeText = vi.fn(() => Promise.resolve());
    // Defined on the real navigator rather than stubbed wholesale: jsdom ships no clipboard, but
    // `platform` must survive for isMacPlatform and for the test that spies on it.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { Terminal: TerminalMock } = await import('@xterm/xterm');
    vi.mocked(TerminalMock).mockImplementation(function() {
      return {
        loadAddon: vi.fn(),
        open: vi.fn(),
        write: vi.fn(),
        onData: vi.fn(() => ({ dispose: vi.fn() })),
        attachCustomKeyEventHandler: vi.fn(),
        hasSelection: vi.fn(() => false),
        getSelection: vi.fn(() => ''),
        buffer: {
          active: {
            viewportY: 0,
            getLine: (index: number) => (screenLines[index] === undefined ? null : {
              translateToString: (trim: boolean) => (trim ? screenLines[index].trimEnd() : screenLines[index]),
            }),
          },
        },
        cols: 80,
        rows: 24,
        parser: { registerOscHandler: vi.fn(() => ({ dispose: vi.fn() })) },
        focus: vi.fn(),
        dispose: vi.fn(),
      };
    } as unknown as typeof Terminal);
  });

  it('offers Chat about this for a held layer selection and sends only that selection', async () => {
    const platform = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const domSelection = vi.spyOn(globalThis, 'getSelection').mockReturnValue(null);
    const request = vi.fn().mockResolvedValue({ ok: true, value: { label: 'Chat about this' } });
    const send = vi.fn();
    const client = { ...mockClient, request, send } as unknown as JanusClient;
    screenLines = ['aa bb', 'cc dd      '];
    try {
      const rendered = render(<>
        <HarnessTab harness={makeHarness()} client={client} label="claude" />
        <DefaultContextMenu client={client} />
      </>);
      const host = rendered.container.querySelector('.harness-body')!;
      const input = document.createElement('textarea');
      shiftDrag(host, 5, 10, 45, 90);
      // The drag's own release already opened the menu automatically; this test's focus is the
      // menu a manual right-click resolves once something else holds the keyboard, so it starts
      // fresh from there.
      request.mockClear();
      host.append(input);
      input.focus();
      send.mockClear();
      fireEvent.contextMenu(input, { clientX: 30, clientY: 40 });
      const entry = await screen.findByText('Chat about this');
      expect(screen.getAllByRole('menuitem').map((item) => item.textContent))
        .toEqual(['Copy', 'Chat about this']);
      expect(request).toHaveBeenCalledExactlyOnceWith({
        method: 'defaultMenuSelectionAction', params: { selection: 'aa bb\ncc dd' },
      });
      fireEvent.click(entry);
      expect(send).toHaveBeenCalledExactlyOnceWith({
        method: 'runDefaultMenuSelectionAction',
        params: { selection: 'aa bb\ncc dd', action: 'Chat about this' },
      });
      expect(writeText).not.toHaveBeenCalled();
    } finally {
      platform.mockRestore();
      domSelection.mockRestore();
    }
  });

  it('exits copy mode when Escape closes the menu the drag itself opened', async () => {
    const domSelection = vi.spyOn(globalThis, 'getSelection').mockReturnValue(null);
    const client = { ...mockClient, request: vi.fn().mockResolvedValue({ ok: true, value: null }) } as unknown as JanusClient;
    screenLines = ['aa bb', 'cc dd'];
    try {
      const rendered = render(<>
        <HarnessTab harness={makeHarness()} client={client} label="claude" />
        <DefaultContextMenu client={client} />
      </>);
      const host = rendered.container.querySelector('.harness-body')!;
      // Stands in for xterm's own focus target: the real emulator's hidden textarea sits inside
      // the container it is opened into, which is what makes the auto-opened menu's restoreFocus
      // resolve back into this terminal rather than the document body.
      const focusTarget = document.createElement('textarea');
      host.append(focusTarget);
      focusTarget.focus();
      shiftDrag(host, 5, 10, 45, 90);
      await screen.findByRole('menu');
      expect(rendered.container.querySelector('.terminal-selection-overlay')).not.toBeNull();
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(rendered.container.querySelector('.terminal-selection-overlay')).toBeNull();
    } finally {
      domSelection.mockRestore();
    }
  });

  it('releases the selection once the menu\'s Copy entry copies it', async () => {
    const domSelection = vi.spyOn(globalThis, 'getSelection').mockReturnValue(null);
    const client = { ...mockClient, request: vi.fn().mockResolvedValue({ ok: true, value: null }) } as unknown as JanusClient;
    screenLines = ['aa bb', 'cc dd'];
    try {
      const rendered = render(<>
        <HarnessTab harness={makeHarness()} client={client} label="claude" />
        <DefaultContextMenu client={client} />
      </>);
      const host = rendered.container.querySelector('.harness-body')!;
      // Stands in for xterm's own focus target: the real emulator's hidden textarea sits inside
      // the container it is opened into, which is what lets `restoreFocus` resolve back into
      // this terminal's own registration.
      const focusTarget = document.createElement('textarea');
      host.append(focusTarget);
      focusTarget.focus();
      shiftDrag(host, 5, 10, 45, 90);
      const copy = await screen.findByText('Copy');
      fireEvent.click(copy);
      expect(writeText).toHaveBeenCalledWith('aa bb\ncc dd');
      expect(rendered.container.querySelector('.terminal-selection-overlay')).toBeNull();
    } finally {
      domSelection.mockRestore();
    }
  });
});
