import React, { createRef } from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EditorView, TabView } from '@shared/protocol';
import { EditorTab, type EditorTabHandle } from './EditorTab';
import type { JanusClient } from './ws';

function makeView(overrides: Partial<EditorView> = {}): EditorView {
  return { name: 'notes.txt', path: '/home/user/notes.txt', size: '12 B', url: '/open/1', ...overrides };
}

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'notes', number: 1, dotColor: '#fff', group: 1, groupColor: '#fff', busy: false, hasUnread: false,
    cwd: '/repo', connections: [], schedule: [], bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    view: 'editor', editor: makeView(), ...overrides,
  };
}

function makeClient(saveError?: string) {
  const saveFile = vi.fn().mockResolvedValue(saveError);
  // The editor debounces a draft sync ~500ms after an edit; under load that timer can fire before
  // the test unmounts, so the mock must implement editorSync or the fire-and-forget call throws.
  const editorSync = vi.fn();
  // useEditorSuggest fetches the persona list on mount and fires editorSuggest queries via the
  // same generic request(); default to no personas and no hunks so the suggestion surface is
  // inert unless a test opts in.
  const request = vi.fn().mockResolvedValue({ names: [], hunks: [] });
  const send = vi.fn();
  return { client: { saveFile, editorSync, request, send } as unknown as JanusClient, saveFile, request, send };
}

async function renderLoaded(client: JanusClient, view = makeView(), tab = makeTab({ editor: view })) {
  const result = render(<EditorTab editor={view} tab={tab} client={client} active />);
  await waitFor(() => expect(screen.getByText('line one')).toBeInTheDocument());
  return result;
}

const textarea = () => screen.getByLabelText('Edit notes.txt');

const nameText = (container: HTMLElement) => container.querySelector('.editor-name')?.textContent ?? '';

const hasEnabledSaveButton = (container: HTMLElement) => !container.querySelector<HTMLButtonElement>('.editor-save-button')!.disabled;
const hasDirtyDot = hasEnabledSaveButton;

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

  it('auto-focuses the textarea once the file has loaded', async () => {
    const { client } = makeClient();
    await renderLoaded(client);
    expect(document.activeElement).toBe(textarea());
  });

  it('starts the cursor on the first line when opened without a target line', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    const current = container.querySelector(':scope .editor-row-current .editor-content');
    expect(current?.textContent).toBe('line one');
  });

  it('enables the save button after an edit and disables it on a successful save', async () => {
    const { client, saveFile } = makeClient();
    const { container } = await renderLoaded(client);
    expect(hasEnabledSaveButton(container)).toBe(false);
    type('x');
    await waitFor(() => expect(hasEnabledSaveButton(container)).toBe(true));
    fireEvent.keyDown(textarea(), { key: 's', metaKey: true });
    await waitFor(() => expect(hasEnabledSaveButton(container)).toBe(false));
    expect(saveFile).toHaveBeenCalledWith('/open/1', 'xline one\nline two');
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('saves the buffer when the dirty metadata button is clicked', async () => {
    const { client, saveFile } = makeClient();
    const { container } = await renderLoaded(client);
    type('x');
    const button = await waitFor(() => {
      const candidate = container.querySelector<HTMLButtonElement>('.editor-save-button');
      expect(candidate).toBeEnabled();
      return candidate!;
    });
    fireEvent.click(button);
    await waitFor(() => expect(saveFile).toHaveBeenCalledWith('/open/1', 'xline one\nline two'));
    await waitFor(() => expect(button).toBeDisabled());
  });

  it('preserves unsaved content and saves it to the renamed file', async () => {
    const { client, saveFile } = makeClient();
    const view = makeView();
    const { container, rerender } = await renderLoaded(client, view);
    type('draft ');
    await waitFor(() => expect(hasDirtyDot(container)).toBe(true));

    const renamed = makeView({ name: 'renamed.txt', path: '/home/user/renamed.txt', url: '/open/2' });
    rerender(<EditorTab editor={renamed} tab={makeTab({ editor: renamed })} client={client} active />);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.editor-content')?.textContent).toBe('draft line one');
    expect(hasDirtyDot(container)).toBe(true);

    fireEvent.keyDown(screen.getByLabelText('Edit renamed.txt'), { key: 's', metaKey: true });
    await waitFor(() => {
      expect(saveFile).toHaveBeenCalledWith('/open/2', 'draft line one\nline two');
      expect(hasDirtyDot(container)).toBe(false);
    });
  });

  it('shows the server error when a save fails', async () => {
    const { client } = makeClient('EACCES: permission denied');
    const { container } = await renderLoaded(client);
    type('x');
    fireEvent.keyDown(textarea(), { key: 's', metaKey: true });
    await waitFor(() => expect(screen.getByText('EACCES: permission denied')).toBeInTheDocument());
    expect(hasDirtyDot(container)).toBe(true);
  });

  it('shows a load error when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    const { client } = makeClient();
    render(<EditorTab editor={makeView()} tab={makeTab()} client={client} active />);
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

  it('does not re-scroll the caret into view on reactivation when the cursor has not moved', async () => {
    const { client } = makeClient();
    const view = makeView();
    const { rerender } = await renderLoaded(client, view);
    const scrollMock = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;

    rerender(<EditorTab editor={view} tab={makeTab({ editor: view })} client={client} active={false} />);
    scrollMock.mockClear();
    rerender(<EditorTab editor={view} tab={makeTab({ editor: view })} client={client} active />);

    expect(scrollMock).not.toHaveBeenCalled();
  });

  it('centers the caret on initial load when opened with a target line', async () => {
    const { client } = makeClient();
    const scrollMock = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    await renderLoaded(client, makeView({ line: 2 }));
    expect(scrollMock).toHaveBeenCalledWith({ block: 'center' });
  });

  it('places the cursor on the given (1-based) line when opened with a target line', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client, makeView({ line: 2 }));
    const gutter = container.querySelector('.editor-row-current')?.querySelector('.editor-gutter');
    expect(gutter?.textContent).toBe('2');
  });

  it('renders a caret span in the active editor', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    expect(container.querySelector('.editor-caret')).toBeInTheDocument();
  });

  it('renders a caret span on an empty document', async () => {
    const { client } = makeClient();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
    } as unknown as Response));
    const { container } = render(<EditorTab editor={makeView()} tab={makeTab()} client={client} active />);
    await waitFor(() => expect(container.querySelectorAll('.editor-gutter')).toHaveLength(1));
    expect(container.querySelector('.editor-caret')).toBeInTheDocument();
  });

  it('does not render a caret span when the editor is inactive', async () => {
    const { client } = makeClient();
    const view = makeView();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('line one\nline two'),
    } as unknown as Response));
    const { container } = render(<EditorTab editor={view} tab={makeTab({ editor: view })} client={client} active={false} />);
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
    render(<EditorTab editor={makeView()} tab={makeTab()} client={client} active ref={ref} />);
    await waitFor(() => expect(screen.getByText('line one')).toBeInTheDocument());
    expect(ref.current?.isDirty()).toBe(false);
    type('x');
    await waitFor(() => expect(ref.current?.isDirty()).toBe(true));
  });

  it('exposes save() that calls saveFile and marks clean', async () => {
    const { client, saveFile } = makeClient();
    const ref = createRef<EditorTabHandle>();
    render(<EditorTab editor={makeView()} tab={makeTab()} client={client} active ref={ref} />);
    await waitFor(() => expect(screen.getByText('line one')).toBeInTheDocument());
    type('x');
    await waitFor(() => expect(ref.current?.isDirty()).toBe(true));
    await act(async () => { await ref.current?.save(); });
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

  it('ArrowDown resolves to a visual row via DOM geometry when layout is available', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    const rows = container.querySelectorAll('.editor-row');
    const secondContent = rows[1].querySelector('.editor-content')!;
    const secondText = secondContent.firstChild!.firstChild!;
    const caret = container.querySelector('.editor-caret')!;

    vi.spyOn(caret, 'getBoundingClientRect').mockReturnValue(
      { top: 0, bottom: 14, left: 3, right: 3, width: 0, height: 14, x: 3, y: 0, toJSON: () => ({}) },
    );
    (document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint =
      vi.fn().mockReturnValue(secondContent as Element);
    (document as unknown as { caretPositionFromPoint: (x: number, y: number) => { offsetNode: Node; offset: number } }).caretPositionFromPoint =
      vi.fn().mockReturnValue({ offsetNode: secondText, offset: 3 });

    fireEvent.keyDown(textarea(), { key: 'ArrowDown' });

    await waitFor(() => {
      const current = container.querySelector(':scope .editor-row-current .editor-content');
      expect(current?.textContent).toBe('line two');
    });

    vi.restoreAllMocks();
    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    delete (document as unknown as { caretPositionFromPoint?: unknown }).caretPositionFromPoint;
  });

  it('consumes Shift+ArrowLeft/Right locally instead of letting them reach the window-level tab-switch shortcut', async () => {
    const { client } = makeClient();
    await renderLoaded(client);
    const spy = vi.fn();
    globalThis.addEventListener('keydown', spy);
    fireEvent.keyDown(textarea(), { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(textarea(), { key: 'ArrowLeft', shiftKey: true });
    globalThis.removeEventListener('keydown', spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it('Shift+ArrowRight extends the in-editor selection, like Shift+ArrowUp/Down', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    fireEvent.keyDown(textarea(), { key: 'ArrowRight', shiftKey: true });
    expect(container.querySelector('.editor-sel')).not.toBeNull();
  });

  it('Shift+ArrowLeft extends the in-editor selection', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    fireEvent.keyDown(textarea(), { key: 'ArrowRight' });
    fireEvent.keyDown(textarea(), { key: 'ArrowLeft', shiftKey: true });
    expect(container.querySelector('.editor-sel')).not.toBeNull();
  });

  it('undoes an edit with Cmd+Z', async () => {
    const { client } = makeClient();
    await renderLoaded(client);
    type('abc');
    await waitFor(() => expect(screen.getByText('abc')).toBeInTheDocument());
    fireEvent.keyDown(textarea(), { key: 'z', metaKey: true });
    await waitFor(() => expect(screen.queryByText('abc')).not.toBeInTheDocument());
  });

  it('does not cancel mouse-down on metadata text', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    const meta = container.querySelector('.editor-meta')!;

    expect(fireEvent.mouseDown(meta)).toBe(true);
  });

  it('renders the save and connections buttons in the same metadata row', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    const meta = container.querySelector('.editor-meta')!;

    expect(meta.querySelector('.editor-save-button')).not.toBeNull();
    expect(meta.querySelector('.tab-connections')).not.toBeNull();
  });

  it('a plain metadata click restores focus to the textarea on mouse-up', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    const ta = textarea();
    ta.blur();
    const meta = container.querySelector('.editor-meta')!;

    fireEvent.mouseUp(meta);

    expect(document.activeElement).toBe(ta);
  });

  it('does not restore editor focus when metadata text is selected', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    vi.spyOn(globalThis, 'getSelection').mockReturnValueOnce({
      toString: () => '/home/user/notes.txt',
    } as Selection);

    fireEvent.mouseUp(container.querySelector('.editor-meta')!);

    expect(document.activeElement).toBe(outside);
    outside.remove();
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

  it('renders hljs-* spans for a .ts file after load', async () => {
    const { client } = makeClient();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('const x = 1;'),
    } as unknown as Response));
    const view = makeView({ name: 'notes.ts' });
    const { container } = render(<EditorTab editor={view} tab={makeTab({ editor: view })} client={client} active />);
    await waitFor(() => expect(container.querySelector('.hljs-keyword')).toBeInTheDocument());
  });

  it('renders no hljs-* spans for a .txt file', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    expect(container.querySelector('[class*="hljs-"]')).toBeNull();
  });

  it('reloads clean content from disk when mtimeMs changes on an untouched buffer', async () => {
    const { client } = makeClient();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('line one\nline two') })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('changed elsewhere') });
    vi.stubGlobal('fetch', fetchMock);
    const view = makeView({ mtimeMs: 1 });
    const { rerender } = await renderLoaded(client, view);

    rerender(<EditorTab editor={{ ...view, mtimeMs: 2 }} tab={makeTab({ editor: view })} client={client} active />);

    await waitFor(() => expect(screen.getByText('changed elsewhere')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not reload a dirty buffer when mtimeMs changes, and prompts to overwrite on save', async () => {
    const { client, saveFile } = makeClient();
    const view = makeView({ mtimeMs: 1 });
    const { container, rerender } = await renderLoaded(client, view);
    type('x');
    await waitFor(() => expect(hasDirtyDot(container)).toBe(true));

    rerender(<EditorTab editor={{ ...view, mtimeMs: 2 }} tab={makeTab({ editor: view })} client={client} active />);
    expect(screen.getByText('line one')).toBeInTheDocument();

    fireEvent.keyDown(textarea(), { key: 's', metaKey: true });
    await waitFor(() => expect(screen.getByText('This file changed on disk. Overwrite it with your changes?')).toBeInTheDocument());
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('overwriting from the conflict dialog saves the buffer and closes the dialog', async () => {
    const { client, saveFile } = makeClient();
    const view = makeView({ mtimeMs: 1 });
    const { container, rerender } = await renderLoaded(client, view);
    type('x');
    await waitFor(() => expect(hasDirtyDot(container)).toBe(true));
    rerender(<EditorTab editor={{ ...view, mtimeMs: 2 }} tab={makeTab({ editor: view })} client={client} active />);
    fireEvent.keyDown(textarea(), { key: 's', metaKey: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Overwrite (y)' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Overwrite (y)' }));

    expect(saveFile).toHaveBeenCalledWith('/open/1', 'xline one\nline two');
    await waitFor(() => expect(screen.queryByText('This file changed on disk. Overwrite it with your changes?')).not.toBeInTheDocument());
  });

  it('cancelling the conflict dialog leaves the buffer untouched and unsaved', async () => {
    const { client, saveFile } = makeClient();
    const view = makeView({ mtimeMs: 1 });
    const { container, rerender } = await renderLoaded(client, view);
    type('x');
    await waitFor(() => expect(hasDirtyDot(container)).toBe(true));
    rerender(<EditorTab editor={{ ...view, mtimeMs: 2 }} tab={makeTab({ editor: view })} client={client} active />);
    fireEvent.keyDown(textarea(), { key: 's', metaKey: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel (Esc)' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Cancel (Esc)' }));

    expect(saveFile).not.toHaveBeenCalled();
    expect(hasDirtyDot(container)).toBe(true);
    expect(screen.queryByText('This file changed on disk. Overwrite it with your changes?')).not.toBeInTheDocument();
  });

  describe('in-editor persona suggestions', () => {
    function stubRequestFileContent(content: string) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(content) } as unknown as Response));
    }

    it('fires an editorSuggest query on Ctrl/Cmd+Enter and shows the pending panel', async () => {
      const { client, request } = makeClient();
      request.mockReset();
      request.mockResolvedValueOnce({ names: ['summarizer'] });
      request.mockResolvedValueOnce({ hunks: [{ anchor: 'line one', replacement: 'LINE ONE' }] });
      stubRequestFileContent('line one\n> summarizer rewrite this');
      await renderLoaded(client, makeView({ line: 2 }));

      fireEvent.keyDown(textarea(), { key: 'Enter', metaKey: true });

      expect(request).toHaveBeenCalledWith({
        method: 'editorSuggest',
        params: { url: '/open/1', persona: 'summarizer', content: 'line one\n> summarizer rewrite this', prompt: 'rewrite this' },
      });
      await waitFor(() => expect(screen.getByText('Accept or decline each change below')).toBeInTheDocument());
      expect(screen.getByText('1 of 1 remaining')).toBeInTheDocument();
    });

    it('previews the pending hunk inline: struck-through removed line and an added line below it, with accept/decline icons', async () => {
      const { client, request } = makeClient();
      request.mockReset();
      request.mockResolvedValueOnce({ names: ['summarizer'] });
      request.mockResolvedValueOnce({ hunks: [{ anchor: 'line one', replacement: 'LINE ONE' }] });
      stubRequestFileContent('line one\n> summarizer rewrite this');
      const { container } = await renderLoaded(client, makeView({ line: 2 }));

      fireEvent.keyDown(textarea(), { key: 'Enter', metaKey: true });

      await waitFor(() => expect(container.querySelector('.editor-diff-remove')).not.toBeNull());
      expect(container.querySelector(':scope .editor-diff-remove .editor-content')?.textContent).toBe('line one');
      expect(container.querySelector(':scope .editor-diff-add .editor-content')?.textContent).toBe('LINE ONE');
      expect(container.querySelector(':scope .editor-diff-add .editor-gutter')?.textContent).toBe('+');
      expect(container.querySelector('.editor-diff-controls')).not.toBeNull();
    });

    it('does not fire on a plain Enter', async () => {
      const { client, request } = makeClient();
      request.mockReset();
      request.mockResolvedValueOnce({ names: ['summarizer'] });
      stubRequestFileContent('line one\n> summarizer rewrite this');
      await renderLoaded(client, makeView({ line: 2 }));

      fireEvent.keyDown(textarea(), { key: 'Enter' });

      expect(request).toHaveBeenCalledTimes(1); // only the persona-list fetch
    });

    it('accepts a hunk by clicking its accept icon, updates the buffer, and removes the request line', async () => {
      const { client, request } = makeClient();
      request.mockReset();
      request.mockResolvedValueOnce({ names: ['summarizer'] });
      request.mockResolvedValueOnce({ hunks: [{ anchor: 'line one', replacement: 'LINE ONE' }] });
      stubRequestFileContent('line one\n> summarizer rewrite this');
      const { container } = await renderLoaded(client, makeView({ line: 2 }));
      fireEvent.keyDown(textarea(), { key: 'Enter', metaKey: true });
      await waitFor(() => expect(screen.getByText('Accept or decline each change below')).toBeInTheDocument());

      fireEvent.click(screen.getByLabelText('Accept'));

      await waitFor(() => expect(screen.queryByText('Accept or decline each change below')).not.toBeInTheDocument());
      expect(container.querySelector('.editor-content')?.textContent).toBe('LINE ONE');
    });

    it('declines every hunk by clicking decline, leaving the buffer and request line unchanged', async () => {
      const { client, request } = makeClient();
      request.mockReset();
      request.mockResolvedValueOnce({ names: ['summarizer'] });
      request.mockResolvedValueOnce({ hunks: [{ anchor: 'line one', replacement: 'LINE ONE' }] });
      stubRequestFileContent('line one\n> summarizer rewrite this');
      await renderLoaded(client, makeView({ line: 2 }));
      fireEvent.keyDown(textarea(), { key: 'Enter', metaKey: true });
      await waitFor(() => expect(screen.getByText('Accept or decline each change below')).toBeInTheDocument());

      fireEvent.click(screen.getByLabelText('Decline'));

      await waitFor(() => expect(screen.queryByText('Accept or decline each change below')).not.toBeInTheDocument());
      expect(screen.getByText('> summarizer rewrite this')).toBeInTheDocument();
    });

    it('blocks ordinary typing while a hunk is pending', async () => {
      const { client, request } = makeClient();
      request.mockReset();
      request.mockResolvedValueOnce({ names: ['summarizer'] });
      request.mockResolvedValueOnce({ hunks: [{ anchor: 'line one', replacement: 'LINE ONE' }] });
      stubRequestFileContent('line one\n> summarizer rewrite this');
      await renderLoaded(client, makeView({ line: 2 }));
      fireEvent.keyDown(textarea(), { key: 'Enter', metaKey: true });
      await waitFor(() => expect(screen.getByText('Accept or decline each change below')).toBeInTheDocument());

      fireEvent.keyDown(textarea(), { key: 'ArrowRight' });
      fireEvent.keyDown(textarea(), { key: 'z' });

      expect(screen.getByText('Accept or decline each change below')).toBeInTheDocument();
      expect(screen.getByText('> summarizer rewrite this')).toBeInTheDocument();
    });

    it('previews multiple hunks simultaneously and resolves them independently', async () => {
      const { client, request } = makeClient();
      request.mockReset();
      request.mockResolvedValueOnce({ names: ['summarizer'] });
      request.mockResolvedValueOnce({
        hunks: [
          { anchor: 'line one', replacement: 'LINE ONE' },
          { anchor: 'line two', replacement: 'LINE TWO' },
        ],
      });
      stubRequestFileContent('line one\nline two\n> summarizer rewrite this');
      const { container } = await renderLoaded(client, makeView({ line: 3 }));
      fireEvent.keyDown(textarea(), { key: 'Enter', metaKey: true });

      await waitFor(() => expect(screen.getByText('2 of 2 remaining')).toBeInTheDocument());
      const addedTexts = [...container.querySelectorAll(':scope .editor-diff-add .editor-content')].map((n) => n.textContent);
      expect(addedTexts).toEqual(['LINE ONE', 'LINE TWO']);

      fireEvent.click(screen.getAllByLabelText('Accept')[0]);

      await waitFor(() => expect(screen.getByText('1 of 2 remaining')).toBeInTheDocument());
      expect(container.querySelector(':scope .editor-diff-add .editor-content')?.textContent).toBe('LINE TWO');
      expect(screen.getByText('> summarizer rewrite this')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Accept'));

      await waitFor(() => expect(screen.queryByText('Accept or decline each change below')).not.toBeInTheDocument());
      expect(screen.queryByText('> summarizer rewrite this')).not.toBeInTheDocument();
    });
  });

  describe('persona connections window', () => {
    it('shows the connections button dark/disabled with no open persona connections', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);
      expect(container.querySelector('.tab-connections')).toHaveClass('status-window-button-empty');
    });

    it('shows the connections window with a persona row once tab.connections is non-empty', async () => {
      const { client } = makeClient();
      const view = makeView();
      const tab = makeTab({ editor: view, connections: [{ text: 'reviewer (acp)', kind: 'acp' }] });
      const { container } = await renderLoaded(client, view, tab);
      const button = container.querySelector('.tab-connections')!;
      expect(button).not.toHaveClass('status-window-button-empty');

      fireEvent.mouseEnter(button);
      expect(container.querySelector('.panel-row.conn-acp')?.textContent).toContain('reviewer (acp)');
    });

    it('clicking a row\'s close control fires closeEditorConnection with the tab\'s url and persona', async () => {
      const { client } = makeClient();
      const view = makeView();
      const tab = makeTab({ editor: view, connections: [{ text: 'reviewer (acp)', kind: 'acp' }] });
      const { container } = await renderLoaded(client, view, tab);
      const button = container.querySelector('.tab-connections')!;
      fireEvent.mouseEnter(button);

      fireEvent.click(container.querySelector('.panel-row-close')!);

      expect(client.send).toHaveBeenCalledWith({
        method: 'closeEditorConnection',
        params: { url: '/open/1', persona: 'reviewer' },
      });
    });
  });
});
