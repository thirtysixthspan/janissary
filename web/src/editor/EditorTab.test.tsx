import React, { createRef } from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EditorView, TabView } from '@shared/protocol';
import { EditorTab } from './EditorTab';
import type { EditorDropHandle } from '../drop-handles';
import type { KeyLike } from './keys';
import type { useEditorPlugins } from './plugins/useEditorPlugins';

type EditorPluginsModule = { useEditorPlugins: typeof useEditorPlugins };
import type { DirtyTabHandle } from '../tab-handles';
import type { JanusClient } from '../ws';

// A disabled plugin stops claiming its chords (plugins/host.ts filters them out of `bindings()`),
// which is the only way a yielded chord goes unclaimed. Flipping this flag simulates that without
// mocking the registry, which would disable the real plugins every other test here drives.
const mocks = vi.hoisted(() => ({ pluginsDisabled: { value: false } }));

vi.mock('./plugins/useEditorPlugins', async (importOriginal) => {
  const actual = await importOriginal<EditorPluginsModule>();
  return {
    ...actual,
    useEditorPlugins: (...args: Parameters<typeof actual.useEditorPlugins>) => {
      const handle = actual.useEditorPlugins(...args);
      return (event: KeyLike) => (mocks.pluginsDisabled.value ? false : handle(event));
    },
  };
});

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
  // The tab's load and watched reload both go through the client now. Mirror the real method's
  // shape — fetch, throw on a non-ok response, return the body — so the cases below keep driving
  // the read by stubbing global `fetch`.
  const readFile = vi.fn(async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  });
  return { client: { saveFile, editorSync, request, send, readFile } as unknown as JanusClient, saveFile, request, send };
}

async function renderLoaded(client: JanusClient, view = makeView(), tab = makeTab({ editor: view })) {
  const result = render(<EditorTab editor={view} tab={tab} client={client} active />);
  await waitFor(() => expect(screen.getByText('line one')).toBeInTheDocument());
  return result;
}

const textarea = () => screen.getByLabelText('Edit notes.txt');

const nameText = (container: HTMLElement) => container.querySelector('.editor-name')?.textContent ?? '';

// The end-of-line caret span carries a zero-width space so the browser gives it a line box height
// (render.tsx); strip it before comparing textContent against plain expected text.
const queryRowText = (container: HTMLElement) => (container.querySelector(':scope .editor-row-query .editor-content')?.textContent ?? '').replaceAll('\u{200B}', '');

const hasEnabledSaveButton = (container: HTMLElement) => !container.querySelector<HTMLButtonElement>('.editor-save-button')!.disabled;
const hasDirtyDot = hasEnabledSaveButton;

// `Promise.withResolvers` (ES2024) predates this project's `lib` target; a small typed shim keeps
// the tests off the disallowed "extract resolver from `new Promise()`" pattern regardless.
function withResolvers<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  const state = { resolve: undefined as unknown as (value: T) => void };
  const promise = new Promise<T>((resolve) => { state.resolve = resolve; });
  return { promise, resolve: state.resolve };
}

function type(text: string) {
  const element = textarea() as HTMLTextAreaElement;
  element.value = text;
  fireEvent.input(element);
}

beforeEach(() => {
  mocks.pluginsDisabled.value = false;
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
    const ref = createRef<DirtyTabHandle>();
    render(<EditorTab editor={makeView()} tab={makeTab()} client={client} active ref={ref} />);
    await waitFor(() => expect(screen.getByText('line one')).toBeInTheDocument());
    expect(ref.current?.isDirty()).toBe(false);
    type('x');
    await waitFor(() => expect(ref.current?.isDirty()).toBe(true));
  });

  it('exposes save() that calls saveFile and marks clean', async () => {
    const { client, saveFile } = makeClient();
    const ref = createRef<DirtyTabHandle>();
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

  it('ArrowDown at the bottom edge scrolls one screen row instead of crossing a whole buffer line', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    const body = container.querySelector('.editor-body') as HTMLElement;
    const firstContent = container.querySelector(':scope .editor-row .editor-content')!;
    const firstText = firstContent.lastChild!.firstChild!;
    const caret = container.querySelector('.editor-caret')!;

    // A two-row-tall viewport with the caret on its last row, so the row it would move onto is not
    // painted until the body scrolls. The caret's box tracks scrollTop, as it does in a browser.
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue(
      { top: 0, bottom: 28, left: 0, right: 80, width: 80, height: 28, x: 0, y: 0, toJSON: () => ({}) },
    );
    vi.spyOn(caret, 'getBoundingClientRect').mockImplementation(() => (
      { top: 14 - body.scrollTop, bottom: 28 - body.scrollTop, left: 3, right: 3, width: 0, height: 14, x: 3, y: 14 - body.scrollTop, toJSON: () => ({}) }
    ));
    // The revealed row is a wrapped continuation of the same buffer line, so the visual hit stays
    // on line one — a fall back to logical movement would land on line two instead.
    (document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint =
      vi.fn().mockReturnValue(firstContent as Element);
    (document as unknown as { caretPositionFromPoint: (x: number, y: number) => { offsetNode: Node; offset: number } }).caretPositionFromPoint =
      vi.fn().mockReturnValue({ offsetNode: firstText, offset: 5 });

    fireEvent.keyDown(textarea(), { key: 'ArrowDown' });

    await waitFor(() => {
      const current = container.querySelector(':scope .editor-row-current .editor-content');
      expect(current?.textContent).toBe('line one');
    });
    expect(body.scrollTop).toBe(14);

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

  it('groups every metadata button in the right-side actions', async () => {
    const { client } = makeClient();
    const { container } = render(
      <EditorTab
        editor={makeView({ sync: 'synced' })}
        tab={makeTab({ editor: makeView({ sync: 'synced' }) })}
        client={client}
        active
        onSplit={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText('line one')).toBeInTheDocument());
    const actions = container.querySelector('.editor-actions')!;

    expect(actions.querySelectorAll('button')).toHaveLength(4);
    expect(container.querySelector('.editor-meta')?.querySelectorAll(':scope > button')).toHaveLength(0);
  });

  it('does not render a sync status icon for an ordinary, non-synced editor tab', async () => {
    const { client } = makeClient();
    const { container } = await renderLoaded(client);
    expect(container.querySelector('.editor-sync-icon')).toBeNull();
  });

  it('renders the provisioning sync status icon for a synced tab not yet filled in, without loading content', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { client } = makeClient();
    const view = makeView({ sync: 'provisioning' });
    const { container } = render(<EditorTab editor={view} tab={makeTab({ editor: view })} client={client} active />);
    await waitFor(() => expect(container.querySelector('.editor-sync-icon--provisioning')).not.toBeNull());
    expect(container.querySelectorAll('.editor-gutter')).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads the real content once a provisioning synced tab transitions to synced', async () => {
    const { client } = makeClient();
    const view = makeView({ sync: 'provisioning' });
    const { container, rerender } = render(<EditorTab editor={view} tab={makeTab({ editor: view })} client={client} active />);
    expect(container.querySelectorAll('.editor-gutter')).toHaveLength(0);

    const synced = { ...view, url: '/open/2', size: '12 B', sync: 'synced' as const };
    rerender(<EditorTab editor={synced} tab={makeTab({ editor: synced })} client={client} active />);

    await waitFor(() => expect(screen.getByText('line one')).toBeInTheDocument());
  });

  it('anchors the floating connections window below the metadata row, inside the editor body', async () => {
    const { client } = makeClient();
    const tab = makeTab({ connections: [{ text: 'reviewer (acp)', kind: 'acp' }] });
    const { container } = await renderLoaded(client, makeView(), tab);

    const body = container.querySelector('.editor-body')!;
    const meta = container.querySelector('.editor-meta')!;
    expect(body.querySelector('.status-panels')).not.toBeNull();
    expect(meta.querySelector('.status-panels')).toBeNull();
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

  it('reloads content on the first mtimeMs change after a freshly-opened tab (e.g. a resync)', async () => {
    const { client } = makeClient();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('line one\nline two') })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('line one') });
    vi.stubGlobal('fetch', fetchMock);
    const view = makeView({ sync: 'synced' });
    const { rerender } = await renderLoaded(client, view);

    rerender(<EditorTab editor={{ ...view, mtimeMs: 1 }} tab={makeTab({ editor: view })} client={client} active />);

    await waitFor(() => expect(screen.queryByText('line two')).not.toBeInTheDocument());
    expect(screen.getByText('line one')).toBeInTheDocument();
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

  it('clicking the synced sync icon sends resyncEditorTab with the tab\'s url', async () => {
    const { client } = makeClient();
    const view = makeView({ sync: 'synced' });
    const { container } = await renderLoaded(client, view);

    fireEvent.click(container.querySelector('.editor-sync-icon')!);

    expect(client.send).toHaveBeenCalledWith({ method: 'resyncEditorTab', params: { url: '/open/1' } });
  });

  describe('in-editor agent query line', () => {
    function stubRequestFileContent(content: string) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(content) } as unknown as Response));
    }

    // Opens the query line on line 2 (an empty line at the end of the two-line fixture) and types
    // a full `> <persona> <prompt>` request into it via the keydown path.
    function openAndType(query: string) {
      fireEvent.keyDown(textarea(), { key: '>' });
      for (const key of query) fireEvent.keyDown(textarea(), { key });
    }

    it('opens an inline query row when > is pressed on an empty line', async () => {
      const { client } = makeClient();
      stubRequestFileContent('line one\n');
      const { container } = await renderLoaded(client, makeView({ line: 2 }));

      fireEvent.keyDown(textarea(), { key: '>' });

      expect(container.querySelector('.editor-row-query')).not.toBeNull();
      expect(queryRowText(container)).toBe('>');
    });

    it('does not insert a literal > into the buffer when it opens the query line', async () => {
      const { client } = makeClient();
      stubRequestFileContent('line one\n');
      const { container } = await renderLoaded(client, makeView({ line: 2 }));

      fireEvent.keyDown(textarea(), { key: '>' });

      const bufferTexts = [...container.querySelectorAll(':scope .editor-row:not(.editor-row-query) .editor-content')].map((n) => n.textContent);
      expect(bufferTexts).not.toContain('>');
      expect(bufferTexts).toEqual(['line one']);
    });

    it('inserts a literal > when typed on a non-empty line', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);

      fireEvent.keyDown(textarea(), { key: '>' });

      expect(container.querySelector('.editor-row-query')).toBeNull();
      expect(container.querySelector('.editor-content')?.textContent).toBe('>line one');
    });

    it('closes the query line and inserts nothing on Escape', async () => {
      const { client } = makeClient();
      stubRequestFileContent('line one\n');
      const { container } = await renderLoaded(client, makeView({ line: 2 }));
      fireEvent.keyDown(textarea(), { key: '>' });

      fireEvent.keyDown(textarea(), { key: 'Escape' });

      expect(container.querySelector('.editor-row-query')).toBeNull();
      expect(container.querySelector(':scope .editor-row .editor-content')?.textContent).not.toContain('>');
    });

    it('cancels an in-flight request on Escape so its reply never opens a pending review', async () => {
      const { client, request } = makeClient();
      request.mockReset();
      request.mockResolvedValueOnce({ names: ['summarizer'] });
      const { promise, resolve } = withResolvers<{ hunks: { anchor: string; replacement: string }[] }>();
      request.mockImplementationOnce(() => promise);
      stubRequestFileContent('line one\n');
      const { container } = await renderLoaded(client, makeView({ line: 2 }));

      openAndType(' summarizer rewrite this');
      fireEvent.keyDown(textarea(), { key: 'Enter', metaKey: true });
      await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'editorSuggest' })));

      fireEvent.keyDown(textarea(), { key: 'Escape' });
      expect(container.querySelector('.editor-row-query')).toBeNull();

      await act(async () => { resolve({ hunks: [{ anchor: 'line one', replacement: 'LINE ONE' }] }); });

      expect(container.querySelector('.editor-diff-controls')).toBeNull();
      expect(container.querySelector('.editor-row-query')).toBeNull();
      expect(screen.queryByText('Accept or decline each change below')).not.toBeInTheDocument();
    });

    it('lets the buffer be edited via a click while the query line stays open', async () => {
      const { client } = makeClient();
      stubRequestFileContent('line one\n');
      const { container } = await renderLoaded(client, makeView({ line: 2 }));

      fireEvent.keyDown(textarea(), { key: '>' });
      expect(container.querySelector('.editor-row-query')).not.toBeNull();

      const bufferContent = container.querySelector(':scope .editor-row:not(.editor-row-query) .editor-content') as HTMLElement;
      fireEvent.mouseDown(bufferContent, { clientX: 0, clientY: 0, detail: 1 });
      type('X');

      expect(container.querySelector(':scope .editor-row:not(.editor-row-query) .editor-content')?.textContent).toBe('Xline one');
      expect(container.querySelector('.editor-row-query')).not.toBeNull();
    });

    it('switches focus back to the query row on click without closing it, keeping both texts', async () => {
      const { client } = makeClient();
      stubRequestFileContent('line one\n');
      const { container } = await renderLoaded(client, makeView({ line: 2 }));

      openAndType(' summarizer hi');
      const bufferContent = container.querySelector(':scope .editor-row:not(.editor-row-query) .editor-content') as HTMLElement;
      fireEvent.mouseDown(bufferContent, { clientX: 0, clientY: 0, detail: 1 });
      type('X');

      const queryContent = container.querySelector(':scope .editor-row-query .editor-content') as HTMLElement;
      fireEvent.mouseDown(queryContent, { clientX: 0, clientY: 0, detail: 1 });
      fireEvent.keyDown(textarea(), { key: '!' });

      expect(queryRowText(container)).toContain('!');
      expect(container.querySelector(':scope .editor-row:not(.editor-row-query) .editor-content')?.textContent).toBe('Xline one');
      expect(container.querySelector('.editor-row-query')).not.toBeNull();
    });

    it('opening, typing, and closing the query line never dirties the buffer', async () => {
      const { client } = makeClient();
      stubRequestFileContent('line one\n');
      const { container } = await renderLoaded(client, makeView({ line: 2 }));

      openAndType(' summarizer hi');
      expect(hasEnabledSaveButton(container)).toBe(false);

      fireEvent.keyDown(textarea(), { key: 'Escape' });
      expect(hasEnabledSaveButton(container)).toBe(false);
    });

    it('fires an editorSuggest query on Ctrl/Cmd+Enter from the query text and previews the single hunk without the multi-change banner', async () => {
      const { client, request } = makeClient();
      request.mockReset();
      request.mockResolvedValueOnce({ names: ['summarizer'] });
      request.mockResolvedValueOnce({ hunks: [{ anchor: 'line one', replacement: 'LINE ONE' }] });
      stubRequestFileContent('line one\n');
      const { container } = await renderLoaded(client, makeView({ line: 2 }));

      openAndType(' summarizer rewrite this');
      fireEvent.keyDown(textarea(), { key: 'Enter', metaKey: true });

      expect(request).toHaveBeenCalledWith({
        method: 'editorSuggest',
        params: { url: '/open/1', persona: 'summarizer', content: 'line one\n', prompt: 'rewrite this' },
      });
      await waitFor(() => expect(container.querySelector('.editor-diff-controls')).not.toBeNull());
      expect(screen.queryByText('Accept or decline each change below')).not.toBeInTheDocument();
    });

    it('previews the pending hunk inline: struck-through removed line and an added line below it, with accept/decline icons', async () => {
      const { client, request } = makeClient();
      request.mockReset();
      request.mockResolvedValueOnce({ names: ['summarizer'] });
      request.mockResolvedValueOnce({ hunks: [{ anchor: 'line one', replacement: 'LINE ONE' }] });
      stubRequestFileContent('line one\n');
      const { container } = await renderLoaded(client, makeView({ line: 2 }));

      openAndType(' summarizer rewrite this');
      fireEvent.keyDown(textarea(), { key: 'Enter', metaKey: true });

      await waitFor(() => expect(container.querySelector('.editor-diff-remove')).not.toBeNull());
      expect(container.querySelector(':scope .editor-diff-remove .editor-content')?.textContent).toBe('line one');
      expect(container.querySelector(':scope .editor-diff-add .editor-content')?.textContent).toBe('LINE ONE');
      expect(container.querySelector(':scope .editor-diff-add .editor-gutter')?.textContent).toBe('+');
      expect(container.querySelector('.editor-diff-controls')).not.toBeNull();
    });

    it('does not fire on a plain Enter when the query is not yet runnable', async () => {
      const { client, request } = makeClient();
      request.mockReset();
      request.mockResolvedValueOnce({ names: ['summarizer'] });
      stubRequestFileContent('line one\n');
      await renderLoaded(client, makeView({ line: 2 }));

      fireEvent.keyDown(textarea(), { key: '>' });
      fireEvent.keyDown(textarea(), { key: 'Enter' });

      expect(request).toHaveBeenCalledTimes(1); // only the persona-list fetch
    });

    it('sends via the run pill click as well as Enter', async () => {
      const { client, request } = makeClient();
      request.mockReset();
      request.mockResolvedValueOnce({ names: ['summarizer'] });
      request.mockResolvedValueOnce({ hunks: [{ anchor: 'line one', replacement: 'LINE ONE' }] });
      stubRequestFileContent('line one\n');
      const { container } = await renderLoaded(client, makeView({ line: 2 }));
      openAndType(' summarizer rewrite this');

      const pill = container.querySelector('.editor-suggest-pill-run')!;
      fireEvent.click(pill);

      await waitFor(() => expect(container.querySelector('.editor-diff-controls')).not.toBeNull());
    });

    it('accepts a hunk by clicking its accept icon, updates the buffer, and closes the query line', async () => {
      const { client, request } = makeClient();
      request.mockReset();
      request.mockResolvedValueOnce({ names: ['summarizer'] });
      request.mockResolvedValueOnce({ hunks: [{ anchor: 'line one', replacement: 'LINE ONE' }] });
      stubRequestFileContent('line one\n');
      const { container } = await renderLoaded(client, makeView({ line: 2 }));
      openAndType(' summarizer rewrite this');
      fireEvent.keyDown(textarea(), { key: 'Enter', metaKey: true });
      await waitFor(() => expect(container.querySelector('.editor-diff-controls')).not.toBeNull());

      fireEvent.click(screen.getByLabelText('Accept'));

      await waitFor(() => expect(container.querySelector('.editor-diff-controls')).toBeNull());
      expect(container.querySelector(':scope .editor-row:not(.editor-row-query) .editor-content')?.textContent).toBe('LINE ONE');
      expect(container.querySelector('.editor-row-query')).toBeNull();
    });

    it('declines every hunk, leaving the buffer unchanged, and keeps the query line open with its text', async () => {
      const { client, request } = makeClient();
      request.mockReset();
      request.mockResolvedValueOnce({ names: ['summarizer'] });
      request.mockResolvedValueOnce({ hunks: [{ anchor: 'line one', replacement: 'LINE ONE' }] });
      stubRequestFileContent('line one\n');
      const { container } = await renderLoaded(client, makeView({ line: 2 }));
      openAndType(' summarizer rewrite this');
      fireEvent.keyDown(textarea(), { key: 'Enter', metaKey: true });
      await waitFor(() => expect(container.querySelector('.editor-diff-controls')).not.toBeNull());

      fireEvent.click(screen.getByLabelText('Decline'));

      await waitFor(() => expect(container.querySelector('.editor-diff-controls')).toBeNull());
      expect(queryRowText(container)).toBe('> summarizer rewrite this');
    });

    it('blocks ordinary typing while a hunk is pending', async () => {
      const { client, request } = makeClient();
      request.mockReset();
      request.mockResolvedValueOnce({ names: ['summarizer'] });
      request.mockResolvedValueOnce({ hunks: [{ anchor: 'line one', replacement: 'LINE ONE' }] });
      stubRequestFileContent('line one\n');
      const { container } = await renderLoaded(client, makeView({ line: 2 }));
      openAndType(' summarizer rewrite this');
      fireEvent.keyDown(textarea(), { key: 'Enter', metaKey: true });
      await waitFor(() => expect(container.querySelector('.editor-diff-controls')).not.toBeNull());

      fireEvent.keyDown(textarea(), { key: 'ArrowRight' });
      fireEvent.keyDown(textarea(), { key: 'z' });

      expect(container.querySelector('.editor-diff-controls')).not.toBeNull();
      expect(queryRowText(container)).toBe('> summarizer rewrite this');
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
      stubRequestFileContent('line one\nline two\n');
      const { container } = await renderLoaded(client, makeView({ line: 3 }));
      openAndType(' summarizer rewrite this');
      fireEvent.keyDown(textarea(), { key: 'Enter', metaKey: true });

      await waitFor(() => expect(screen.getByText('2 of 2 remaining')).toBeInTheDocument());
      const addedTexts = [...container.querySelectorAll(':scope .editor-diff-add .editor-content')].map((n) => n.textContent);
      expect(addedTexts).toEqual(['LINE ONE', 'LINE TWO']);

      fireEvent.click(screen.getAllByLabelText('Accept')[0]);

      await waitFor(() => expect(screen.getByText('1 of 2 remaining')).toBeInTheDocument());
      expect(container.querySelector(':scope .editor-diff-add .editor-content')?.textContent).toBe('LINE TWO');
      expect(container.querySelector('.editor-row-query')).not.toBeNull();

      fireEvent.click(screen.getByLabelText('Accept'));

      await waitFor(() => expect(screen.queryByText('Accept or decline each change below')).not.toBeInTheDocument());
      expect(container.querySelector('.editor-row-query')).toBeNull();
    });

    it('routes a paste (via the hidden textarea) into the query text, not the buffer, while the query line is active', async () => {
      const { client } = makeClient();
      stubRequestFileContent('line one\n');
      const { container } = await renderLoaded(client, makeView({ line: 2 }));
      fireEvent.keyDown(textarea(), { key: '>' });

      type(' summarizer pasted text');

      expect(queryRowText(container)).toBe('> summarizer pasted text');
      expect(container.querySelector(':scope .editor-row:not(.editor-row-query) .editor-content')?.textContent).toBe('line one');
    });
  });

  describe('find overlay', () => {
    const findInput = () => screen.getByPlaceholderText('Search buffer');
    const noFindInput = () => screen.queryByPlaceholderText('Search buffer');
    const currentLine = (container: HTMLElement) => container.querySelector(':scope .editor-row-current .editor-content')?.textContent;
    const bufferTexts = (container: HTMLElement) =>
      [...container.querySelectorAll(':scope .editor-row:not(.editor-row-query) .editor-content')].map((n) => n.textContent);

    const findRows = (container: HTMLElement) => container.querySelectorAll('.editor-find-row');

    function openFind() {
      fireEvent.keyDown(textarea(), { key: 'f', metaKey: true });
    }

    function search(text: string) {
      fireEvent.change(findInput(), { target: { value: text } });
    }

    // The overlay filters on the buffer as it renders, so a freshly typed query settles a tick later.
    async function searchForOneRow(container: HTMLElement, text: string) {
      search(text);
      await waitFor(() => expect(findRows(container)).toHaveLength(1));
    }

    it('opens on Cmd+F without typing an f into the buffer', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);

      openFind();

      expect(findInput()).toBeInTheDocument();
      expect(screen.getByText('type to search')).toBeInTheDocument();
      expect(bufferTexts(container)).toEqual(['line one', 'line two']);
    });

    it('renders the overlay inside the editor tab, not the editor body', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);

      openFind();

      expect(container.querySelector(':scope .editor-tab > .editor-find')).not.toBeNull();
      expect(container.querySelector(':scope .editor-body .editor-find')).toBeNull();
    });

    it('lists the matching buffer lines with their line numbers', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);

      openFind();
      await searchForOneRow(container, 'two');

      expect(container.querySelector('.editor-find-line')?.textContent).toBe('2');
      expect(container.querySelector('.editor-find-text')?.textContent).toBe('line two');
    });

    it('reports a query that matches no line', async () => {
      const { client } = makeClient();
      await renderLoaded(client);

      openFind();
      search('zzz');

      await waitFor(() => expect(screen.getByText('No matching lines')).toBeInTheDocument());
    });

    it('moves the cursor to the highlighted line as the selection changes', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);
      expect(currentLine(container)).toBe('line one');

      openFind();
      await searchForOneRow(container, 'two');
      fireEvent.keyDown(findInput(), { key: 'ArrowDown' });

      await waitFor(() => expect(currentLine(container)).toBe('line two'));
    });

    it('closes on Escape and leaves the cursor on the previewed line', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);
      openFind();
      await searchForOneRow(container, 'two');
      fireEvent.keyDown(findInput(), { key: 'ArrowDown' });
      await waitFor(() => expect(currentLine(container)).toBe('line two'));

      fireEvent.keyDown(findInput(), { key: 'Escape' });

      expect(noFindInput()).toBeNull();
      expect(currentLine(container)).toBe('line two');
      expect(document.activeElement).toBe(textarea());
    });

    it('closes when the tab goes inactive and reopens empty', async () => {
      const { client } = makeClient();
      const view = makeView();
      const { rerender } = await renderLoaded(client, view);
      openFind();
      search('two');
      expect(findInput()).toBeInTheDocument();

      rerender(<EditorTab editor={view} tab={makeTab({ editor: view })} client={client} active={false} />);
      expect(noFindInput()).toBeNull();

      rerender(<EditorTab editor={view} tab={makeTab({ editor: view })} client={client} active />);
      expect(noFindInput()).toBeNull();

      openFind();
      expect(findInput()).toHaveValue('');
    });

    it('does not let the query reach the buffer or dirty it', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);

      openFind();
      await searchForOneRow(container, 'one');

      expect(bufferTexts(container)).toEqual(['line one', 'line two']);
      expect(hasEnabledSaveButton(container)).toBe(false);
    });

    it('does not record the jump as an undo step', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);
      type('abc');
      await waitFor(() => expect(bufferTexts(container)).toEqual(['abcline one', 'line two']));

      openFind();
      await searchForOneRow(container, 'two');
      fireEvent.keyDown(findInput(), { key: 'ArrowDown' });
      await waitFor(() => expect(currentLine(container)).toBe('line two'));
      fireEvent.keyDown(findInput(), { key: 'Escape' });

      fireEvent.keyDown(textarea(), { key: 'z', metaKey: true });

      await waitFor(() => expect(bufferTexts(container)).toEqual(['line one', 'line two']));
    });

    it('stays closed while a persona suggestion is pending', async () => {
      const { client, request } = makeClient();
      request.mockReset();
      request.mockResolvedValueOnce({ names: ['summarizer'] });
      request.mockResolvedValueOnce({ hunks: [{ anchor: 'line one', replacement: 'LINE ONE' }] });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('line one\n') } as unknown as Response));
      const { container } = await renderLoaded(client, makeView({ line: 2 }));
      fireEvent.keyDown(textarea(), { key: '>' });
      for (const key of ' summarizer rewrite this') fireEvent.keyDown(textarea(), { key });
      fireEvent.keyDown(textarea(), { key: 'Enter', metaKey: true });
      await waitFor(() => expect(container.querySelector('.editor-diff-controls')).not.toBeNull());

      openFind();

      expect(noFindInput()).toBeNull();
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

  describe('drop handle', () => {
    it('exposes insertAtCaret via dropRef while active, inserting the dropped path at the cursor', async () => {
      const { client } = makeClient();
      const dropRef = createRef<EditorDropHandle | null>() as React.RefObject<EditorDropHandle | null>;
      const view = makeView();
      const { container } = render(<EditorTab editor={view} tab={makeTab({ editor: view })} client={client} active dropRef={dropRef} />);
      await waitFor(() => expect(screen.getByText('line one')).toBeInTheDocument());

      act(() => { dropRef.current?.insertAtCaret('src/notes.txt'); });

      expect(container.querySelector(':scope .editor-row:not(.editor-row-query) .editor-content')?.textContent).toBe('src/notes.txtline one');
    });

    it('leaves a shared dropRef untouched when the tab is inactive', async () => {
      const { client } = makeClient();
      const dropRef = createRef<EditorDropHandle | null>() as React.RefObject<EditorDropHandle | null>;
      const view = makeView();
      render(<EditorTab editor={view} tab={makeTab({ editor: view })} client={client} active={false} dropRef={dropRef} />);
      await waitFor(() => expect(screen.getByLabelText('Edit notes.txt')).toBeInTheDocument());

      expect(dropRef.current).toBeNull();
    });
  });

  // End-to-end through the real registry, the real lazily-imported commenting plugin, and the real
  // edit applier — the fixture's notes.txt is a `#` language.
  describe('editor plugin bindings', () => {
    const rowText = (container: HTMLElement) => [
      ...container.querySelectorAll(':scope .editor-row:not(.editor-row-query) .editor-content'),
    ].map((row) => (row.textContent ?? '').replaceAll('\u{200B}', ''));

    it('comments the caret\'s line with Cmd+/', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);

      fireEvent.keyDown(textarea(), { key: '/', metaKey: true });

      await waitFor(() => expect(rowText(container)[0]).toBe('# line one'));
      expect(rowText(container)[1]).toBe('line two');
    });

    it('undoes the whole toggle in one step', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);

      fireEvent.keyDown(textarea(), { key: '/', metaKey: true });
      await waitFor(() => expect(rowText(container)[0]).toBe('# line one'));

      fireEvent.keyDown(textarea(), { key: 'z', metaKey: true });
      await waitFor(() => expect(rowText(container)[0]).toBe('line one'));
    });

    it('is a silent no-op in a file with no comment syntax', async () => {
      const { client } = makeClient();
      const view = makeView({ name: 'server.log', path: '/home/user/server.log' });
      const { container } = await renderLoaded(client, view, makeTab({ editor: view }));

      fireEvent.keyDown(screen.getByLabelText('Edit server.log'), { key: '/', metaKey: true });

      await act(async () => { await Promise.resolve(); });
      expect(rowText(container)[0]).toBe('line one');
    });

    it('leaves a chord no plugin claims alone', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);

      const handled = fireEvent.keyDown(textarea(), { key: 'j', metaKey: true });

      // fireEvent returns false only when preventDefault() ran, so an unclaimed chord staying
      // "true" is the assertion that the editor did not swallow it.
      expect(handled).toBe(true);
      await act(async () => { await Promise.resolve(); });
      expect(rowText(container)[0]).toBe('line one');
    });

    it('keeps Cmd+S saving and Cmd+Z undoing with a plugin binding registered', async () => {
      const { client, saveFile } = makeClient();
      const { container } = await renderLoaded(client);

      type('x');
      await waitFor(() => expect(hasEnabledSaveButton(container)).toBe(true));
      fireEvent.keyDown(textarea(), { key: 's', metaKey: true });
      await waitFor(() => expect(saveFile).toHaveBeenCalled());

      fireEvent.keyDown(textarea(), { key: 'z', metaKey: true });
      await waitFor(() => expect(rowText(container)[0]).toBe('line one'));
    });

    // The indenting plugin's Cmd pair fires like any other plugin chord; its Tab pair only fires
    // where the core key table yields (keys.ts `yieldsToPlugins`), which is what these pin.
    it('indents the caret\'s line with Cmd+] and takes it back with Cmd+[', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);

      fireEvent.keyDown(textarea(), { key: ']', metaKey: true });
      await waitFor(() => expect(rowText(container)[0]).toBe('  line one'));
      expect(rowText(container)[1]).toBe('line two');

      fireEvent.keyDown(textarea(), { key: '[', metaKey: true });
      await waitFor(() => expect(rowText(container)[0]).toBe('line one'));
    });

    it('indents every line of a selection spanning two lines with Tab', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);

      fireEvent.keyDown(textarea(), { key: 'ArrowDown', shiftKey: true });
      fireEvent.keyDown(textarea(), { key: 'Tab' });

      await waitFor(() => expect(rowText(container)[0]).toBe('  line one'));
      expect(rowText(container)[1]).toBe('  line two');
    });

    it('outdents a selection spanning two lines with Shift+Tab', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);

      fireEvent.keyDown(textarea(), { key: 'ArrowDown', shiftKey: true });
      fireEvent.keyDown(textarea(), { key: 'Tab' });
      await waitFor(() => expect(rowText(container)[0]).toBe('  line one'));

      fireEvent.keyDown(textarea(), { key: 'Tab', shiftKey: true });
      await waitFor(() => expect(rowText(container)[0]).toBe('line one'));
      expect(rowText(container)[1]).toBe('line two');
    });

    it('replaces a selection inside one line with a tab character, as before', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);

      fireEvent.keyDown(textarea(), { key: 'ArrowRight', shiftKey: true });
      fireEvent.keyDown(textarea(), { key: 'Tab' });

      await act(async () => { await Promise.resolve(); });
      expect(rowText(container)[0]).toBe('\tine one');
    });

    it('still inserts a tab character on Tab with a bare caret', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);

      fireEvent.keyDown(textarea(), { key: 'Tab' });

      await act(async () => { await Promise.resolve(); });
      expect(rowText(container)[0]).toBe('\tline one');
    });

    it('outdents the caret\'s line on Shift+Tab with nothing selected', async () => {
      const { client } = makeClient();
      const { container } = await renderLoaded(client);

      fireEvent.keyDown(textarea(), { key: ']', metaKey: true });
      await waitFor(() => expect(rowText(container)[0]).toBe('  line one'));

      fireEvent.keyDown(textarea(), { key: 'Tab', shiftKey: true });
      await waitFor(() => expect(rowText(container)[0]).toBe('line one'));
    });

    it('falls back to inserting a tab when no plugin claims the yielded chord', async () => {
      const { client } = makeClient();
      mocks.pluginsDisabled.value = true;
      const { container } = await renderLoaded(client);

      fireEvent.keyDown(textarea(), { key: 'ArrowDown', shiftKey: true });
      fireEvent.keyDown(textarea(), { key: 'Tab' });

      await act(async () => { await Promise.resolve(); });
      // The selection spanned both lines, so the core insert replaces it — Tab is never dead.
      expect(rowText(container)[0]).toBe('\tline two');
    });

    it('leaves Tab to the query line, which completes rather than indents', async () => {
      const { client } = makeClient();
      // The query line only opens on an empty line, so this fixture ends with one.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true, text: () => Promise.resolve('line one\n'),
      } as unknown as Response));
      const { container } = await renderLoaded(client, makeView({ line: 2 }));
      fireEvent.keyDown(textarea(), { key: '>' });

      fireEvent.keyDown(textarea(), { key: 'Tab' });

      await act(async () => { await Promise.resolve(); });
      expect(rowText(container)[0]).toBe('line one');
      expect(queryRowText(container)).toBe('>');
    });
  });

  // Cmd+D drives the whole path end to end: the plugin finds the occurrences, the core editor holds
  // the set, renders it, and types into every caret of it.
  describe('multiple selections', () => {
    const rowText = (container: HTMLElement) => [
      ...container.querySelectorAll(':scope .editor-row:not(.editor-row-query) .editor-content'),
    ].map((row) => (row.textContent ?? '').replaceAll('\u{200B}', ''));

    const selectedSpans = (container: HTMLElement) => [
      ...container.querySelectorAll(':scope .editor-content .editor-sel'),
    ].map((span) => span.textContent);

    async function renderFoos(client: JanusClient) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true, text: () => Promise.resolve('foo bar\nfoo baz'),
      } as unknown as Response));
      const result = render(<EditorTab editor={makeView()} tab={makeTab()} client={client} active />);
      await waitFor(() => expect(screen.getByText('bar', { exact: false })).toBeInTheDocument());
      return result;
    }

    // The caret starts at the top of the buffer, so the first press expands the word under it.
    const pressCmdD = () => fireEvent.keyDown(textarea(), { key: 'd', metaKey: true });

    it('selects the word under the caret, then adds the next occurrence', async () => {
      const { client } = makeClient();
      const { container } = await renderFoos(client);

      pressCmdD();
      await waitFor(() => expect(selectedSpans(container)).toEqual(['foo']));

      pressCmdD();
      await waitFor(() => expect(selectedSpans(container)).toEqual(['foo', 'foo']));
    });

    it('types into every selection at once, and undoes all of it in one step', async () => {
      const { client } = makeClient();
      const { container } = await renderFoos(client);

      pressCmdD();
      await waitFor(() => expect(selectedSpans(container)).toEqual(['foo']));
      pressCmdD();
      await waitFor(() => expect(selectedSpans(container)).toEqual(['foo', 'foo']));

      type('qux');
      await waitFor(() => expect(rowText(container)[0]).toBe('qux bar'));
      expect(rowText(container)[1]).toBe('qux baz');

      fireEvent.keyDown(textarea(), { key: 'z', metaKey: true });
      await waitFor(() => expect(rowText(container)[0]).toBe('foo bar'));
      expect(rowText(container)[1]).toBe('foo baz');
    });

    it('does nothing once every occurrence is selected', async () => {
      const { client } = makeClient();
      const { container } = await renderFoos(client);

      pressCmdD();
      await waitFor(() => expect(selectedSpans(container)).toEqual(['foo']));
      pressCmdD();
      await waitFor(() => expect(selectedSpans(container)).toEqual(['foo', 'foo']));

      pressCmdD();
      await act(async () => { await Promise.resolve(); });
      expect(selectedSpans(container)).toEqual(['foo', 'foo']);
    });

    it('steps back one selection with Cmd+U', async () => {
      const { client } = makeClient();
      const { container } = await renderFoos(client);

      pressCmdD();
      await waitFor(() => expect(selectedSpans(container)).toEqual(['foo']));
      pressCmdD();
      await waitFor(() => expect(selectedSpans(container)).toEqual(['foo', 'foo']));

      fireEvent.keyDown(textarea(), { key: 'u', metaKey: true });
      await waitFor(() => expect(selectedSpans(container)).toEqual(['foo']));
    });

    it('collapses to one caret on Escape', async () => {
      const { client } = makeClient();
      const { container } = await renderFoos(client);

      pressCmdD();
      await waitFor(() => expect(selectedSpans(container)).toEqual(['foo']));
      pressCmdD();
      await waitFor(() => expect(selectedSpans(container)).toEqual(['foo', 'foo']));

      fireEvent.keyDown(textarea(), { key: 'Escape' });
      await waitFor(() => expect(selectedSpans(container)).toEqual(['foo']));

      // A second Escape is the editor's own again: it drops the remaining selection.
      fireEvent.keyDown(textarea(), { key: 'Escape' });
      await waitFor(() => expect(selectedSpans(container)).toEqual([]));
    });

    it('collapses to one caret when the find overlay opens', async () => {
      const { client } = makeClient();
      const { container } = await renderFoos(client);

      pressCmdD();
      await waitFor(() => expect(selectedSpans(container)).toEqual(['foo']));
      pressCmdD();
      await waitFor(() => expect(selectedSpans(container)).toEqual(['foo', 'foo']));

      fireEvent.keyDown(textarea(), { key: 'f', metaKey: true });
      await waitFor(() => expect(screen.getByPlaceholderText('Search buffer')).toBeInTheDocument());
      expect(selectedSpans(container)).toEqual([]);
    });

    it('collapses to one caret on save', async () => {
      const { client, saveFile } = makeClient();
      const { container } = await renderFoos(client);

      pressCmdD();
      await waitFor(() => expect(selectedSpans(container)).toEqual(['foo']));
      pressCmdD();
      await waitFor(() => expect(selectedSpans(container)).toEqual(['foo', 'foo']));

      fireEvent.keyDown(textarea(), { key: 's', metaKey: true });
      await waitFor(() => expect(saveFile).toHaveBeenCalled());
      expect(selectedSpans(container)).toEqual([]);
    });
  });
});
