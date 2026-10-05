import React from 'react';
import { render, screen, waitFor, fireEvent, createEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EditorView, TabView } from '@shared/protocol';
import { EditorTab } from './EditorTab';
import type { JanusClient } from '../ws';

function makeView(): EditorView {
  return { name: 'notes.txt', path: '/home/user/notes.txt', size: '12 B', url: '/open/1' };
}

function makeTab(): TabView {
  return {
    label: 'notes', number: 1, dotColor: '#fff', group: 1, groupColor: '#fff', busy: false, hasUnread: false,
    cwd: '/repo', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    view: 'editor', editor: makeView(),
  };
}

function makeClient(): JanusClient {
  const readFile = vi.fn(async (url: string) => {
    const response = await fetch(url);
    return response.text();
  });
  return {
    saveFile: vi.fn(), editorSync: vi.fn().mockResolvedValue({ ok: true, value: 'ok' }), send: vi.fn(), readFile,
    connectionStatus: 'connected', onConnectionStatus: () => () => {},
    request: vi.fn().mockResolvedValue({ ok: true, value: { names: [], hunks: [] } }),
  } as unknown as JanusClient;
}

function ui(overlayOpen: boolean) {
  return <EditorTab editor={makeView()} tab={makeTab()} client={makeClient()} active overlayOpen={overlayOpen} />;
}

async function renderLoaded(overlayOpen = false) {
  const result = render(ui(overlayOpen));
  await waitFor(() => expect(screen.getByText('line one')).toBeInTheDocument());
  return result;
}

const textarea = () => screen.getByLabelText('Edit notes.txt');
const bufferText = (container: HTMLElement) => [...container.querySelectorAll('.editor-content')].map((row) => row.textContent).join('\n').replaceAll('\u{200B}', '');

type Chord = { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };

const windowKeys = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('line one\nline two') } as unknown as Response));
  windowKeys.mockClear();
  globalThis.addEventListener('keydown', windowKeys);
});

afterEach(() => {
  globalThis.removeEventListener('keydown', windowKeys);
});

describe('EditorTab window shortcuts', () => {
  it.each<[string, Chord]>([
    ['Ctrl+G', { key: 'g', ctrlKey: true }],
    ['Ctrl+R', { key: 'r', ctrlKey: true }],
    ['Cmd+P', { key: 'p', metaKey: true }],
    ['Cmd+T', { key: 't', metaKey: true }],
    ['Cmd+Shift+]', { key: '}', metaKey: true, shiftKey: true }],
    ['Cmd+Shift+[', { key: '{', metaKey: true, shiftKey: true }],
    ['Ctrl+Left', { key: 'ArrowLeft', ctrlKey: true }],
    ['Ctrl+Right', { key: 'ArrowRight', ctrlKey: true }],
  ])('lets %s, which the buffer does not bind, reach the window key handler', async (_name, chord) => {
    await renderLoaded();
    fireEvent.keyDown(textarea(), chord);
    expect(windowKeys).toHaveBeenCalledTimes(1);
  });

  it.each<[string, Chord]>([
    ['Shift+Left', { key: 'ArrowLeft', shiftKey: true }],
    ['Ctrl+E', { key: 'e', ctrlKey: true }],
    ['Ctrl+P', { key: 'p', ctrlKey: true }],
    ['Escape', { key: 'Escape' }],
    ['Cmd+F', { key: 'f', metaKey: true }],
    ['a printable character', { key: 'x' }],
  ])('keeps %s, which the buffer binds, from the window key handler', async (_name, chord) => {
    await renderLoaded();
    fireEvent.keyDown(textarea(), chord);
    expect(windowKeys).not.toHaveBeenCalled();
  });

  it('hands every key to the window while an overlay is open, leaving the buffer untouched', async () => {
    const { container } = await renderLoaded(true);
    fireEvent.keyDown(textarea(), { key: 'ArrowDown' });
    const typed = createEvent.keyDown(textarea(), { key: 'x' });
    fireEvent(textarea(), typed);
    expect(windowKeys).toHaveBeenCalledTimes(2);
    expect(typed.defaultPrevented).toBe(true);
    expect(bufferText(container)).toBe('line one\nline two');
  });

  it('ignores a paste while an overlay is open', async () => {
    const { container } = await renderLoaded(true);
    const event = createEvent.paste(textarea(), { clipboardData: { getData: () => 'pasted' } });
    fireEvent(textarea(), event);
    expect(event.defaultPrevented).toBe(true);
    expect(bufferText(container)).toBe('line one\nline two');
  });

  it('puts focus back in the buffer when the overlay closes', async () => {
    const { rerender } = await renderLoaded(true);
    (textarea() as HTMLTextAreaElement).blur();
    expect(document.activeElement).not.toBe(textarea());
    rerender(ui(false));
    await waitFor(() => expect(document.activeElement).toBe(textarea()));
  });
});
