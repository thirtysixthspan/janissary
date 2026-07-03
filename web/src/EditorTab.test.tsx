import React, { createRef } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EditorView } from '@shared/protocol';
import { EditorTab, type EditorTabHandle } from './EditorTab';
import type { JanusClient } from './ws';

function makeView(overrides: Partial<EditorView> = {}): EditorView {
  return { name: 'notes.txt', path: '/home/user/notes.txt', size: '12 B', url: '/open/1', ...overrides };
}

function makeClient(saveError?: string) {
  const saveFile = vi.fn().mockResolvedValue(saveError);
  return { client: { saveFile } as unknown as JanusClient, saveFile };
}

async function renderLoaded(client: JanusClient, view = makeView()) {
  const result = render(<EditorTab editor={view} client={client} active />);
  await waitFor(() => expect(screen.getByText('line one')).toBeInTheDocument());
  return result;
}

const textarea = () => screen.getByLabelText('Edit notes.txt');

const nameText = (container: HTMLElement) => container.querySelector('.image-name')?.textContent ?? '';

function type(text: string) {
  const element = textarea() as HTMLTextAreaElement;
  element.value = text;
  fireEvent.input(element);
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve('line one\nline two'),
  } as unknown as Response));
});

describe('EditorTab', () => {
  it('renders the metadata header and a numbered gutter from fetched content', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    expect(nameText(container)).toBe('notes.txt');
    expect(screen.getByText('12 B')).toBeInTheDocument();
    expect(screen.getByText('/home/user/notes.txt')).toBeInTheDocument();
    const gutters = [...container.querySelectorAll('.editor-gutter')].map((g) => g.textContent);
    expect(gutters).toEqual(['1', '2']);
    expect(screen.getByText('line two')).toBeInTheDocument();
  });

  it('shows a dirty dot after an edit and clears it on a successful save', async () => {
    const { client, saveFile } = makeClient();
    const { container } = await renderLoaded(client);
    expect(nameText(container)).not.toContain('●');
    type('x');
    await waitFor(() => expect(nameText(container)).toContain('●'));
    fireEvent.keyDown(textarea(), { key: 's', metaKey: true });
    await waitFor(() => expect(nameText(container)).not.toContain('●'));
    expect(saveFile).toHaveBeenCalledWith('/open/1', 'xline one\nline two');
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('shows the server error when a save fails', async () => {
    const { client } = makeClient('EACCES: permission denied');
    const { container } = await renderLoaded(client);
    type('x');
    fireEvent.keyDown(textarea(), { key: 's', metaKey: true });
    await waitFor(() => expect(screen.getByText('EACCES: permission denied')).toBeInTheDocument());
    expect(nameText(container)).toContain('●');
  });

  it('shows a load error when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    const { client } = makeClient();
    render(<EditorTab editor={makeView()} client={client} active />);
    await waitFor(() => expect(screen.getByText('Failed to load notes.txt')).toBeInTheDocument());
  });

  it('typing inserts at the cursor and Enter splits the line', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    fireEvent.keyDown(textarea(), { key: 'Enter' });
    await waitFor(() => expect(container.querySelectorAll('.editor-gutter')).toHaveLength(3));
  });

  it('scrolls the caret into view when the cursor moves', async () => {
    const { client } = makeClient();
    await renderLoaded(client);
    const scrollMock = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    scrollMock.mockClear();
    type('x');
    await waitFor(() => expect(scrollMock).toHaveBeenCalledWith({ block: 'nearest' }));
  });

  it('renders a caret span in the active editor', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    expect(container.querySelector('.editor-caret')).toBeInTheDocument();
  });

  it('does not render a caret span when the editor is inactive', async () => {
    const { client } = makeClient();
    const view = makeView();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('line one\nline two'),
    } as unknown as Response));
    const { container } = render(<EditorTab editor={view} client={client} active={false} />);
    await waitFor(() => expect(container.querySelector('.editor-caret')).toBeNull());
  });

  it('renders the caret only on the cursor line, not on other lines', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    const currentRow = container.querySelector('.editor-row-current');
    const otherRows = container.querySelectorAll('.editor-row:not(.editor-row-current)');
    expect(currentRow?.querySelector('.editor-caret')).toBeInTheDocument();
    for (const row of otherRows) {
      expect(row.querySelector('.editor-caret')).toBeNull();
    }
  });

  it('exposes isDirty() returning false after load and true after edit', async () => {
    const { client } = makeClient();
    const ref = createRef<EditorTabHandle>();
    render(<EditorTab editor={makeView()} client={client} active ref={ref} />);
    await waitFor(() => expect(screen.getByText('line one')).toBeInTheDocument());
    expect(ref.current?.isDirty()).toBe(false);
    type('x');
    await waitFor(() => expect(ref.current?.isDirty()).toBe(true));
  });

  it('exposes save() that calls saveFile and marks clean', async () => {
    const { client, saveFile } = makeClient();
    const ref = createRef<EditorTabHandle>();
    render(<EditorTab editor={makeView()} client={client} active ref={ref} />);
    await waitFor(() => expect(screen.getByText('line one')).toBeInTheDocument());
    type('x');
    await waitFor(() => expect(ref.current?.isDirty()).toBe(true));
    await ref.current?.save();
    expect(saveFile).toHaveBeenCalled();
    await waitFor(() => expect(ref.current?.isDirty()).toBe(false));
  });

  it('keeps the textarea focused when clicking empty space in the editor body', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    const textareaEl = textarea();
    textareaEl.focus();
    expect(textareaEl).toHaveFocus();
    const body = container.querySelector('.editor-body') as HTMLElement;
    fireEvent.mouseDown(body);
    expect(textareaEl).toHaveFocus();
  });

  it('undoes an edit with Cmd+Z', async () => {
    const { client } = makeClient();
    await renderLoaded(client);
    type('abc');
    await waitFor(() => expect(screen.getByText('abc')).toBeInTheDocument());
    fireEvent.keyDown(textarea(), { key: 'z', metaKey: true });
    await waitFor(() => expect(screen.queryByText('abc')).not.toBeInTheDocument());
  });

  it('clicking the metadata header does not steal focus from the textarea', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    const ta = textarea();
    ta.focus();
    expect(document.activeElement).toBe(ta);
    const meta = container.querySelector('.image-meta')!;
    fireEvent.mouseDown(meta);
    expect(document.activeElement).toBe(ta);
  });

  it('clicking the editor body outside any line does not steal focus from the textarea', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    const ta = textarea();
    ta.focus();
    expect(document.activeElement).toBe(ta);
    const body = container.querySelector('.editor-body')!;
    fireEvent.mouseDown(body);
    expect(document.activeElement).toBe(ta);
  });
});
