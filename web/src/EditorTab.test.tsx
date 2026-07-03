import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EditorView } from '@shared/protocol';
import { EditorTab } from './EditorTab';
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

  it('undoes an edit with Cmd+Z', async () => {
    const { client } = makeClient();
    await renderLoaded(client);
    type('abc');
    await waitFor(() => expect(screen.getByText('abc')).toBeInTheDocument());
    fireEvent.keyDown(textarea(), { key: 'z', metaKey: true });
    await waitFor(() => expect(screen.queryByText('abc')).not.toBeInTheDocument());
  });
});
