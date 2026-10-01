import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TabView } from '@shared/protocol';
import { createPasteCapability } from './paste-into-surface';
import { editorDropHandle, registerEditorDrop } from './shared/drop-registry';
import type { CommandInputDropHandle } from './shared/drop-handles';
import type { JanusClient } from './ws';

function commandBar(): { bar: HTMLElement; textarea: HTMLTextAreaElement; handle: CommandInputDropHandle } {
  const bar = document.createElement('div');
  bar.dataset.commandBar = '';
  const textarea = document.createElement('textarea');
  bar.append(textarea);
  document.body.append(bar);
  const handle: CommandInputDropHandle = { insertAtCaret: vi.fn(), setDropHighlighted: vi.fn() };
  return { bar, textarea, handle };
}

function editor(label: string): { body: HTMLElement; textarea: HTMLTextAreaElement; paste: ReturnType<typeof vi.fn> } {
  const body = document.createElement('div');
  body.dataset.editorDrop = label;
  const textarea = document.createElement('textarea');
  body.append(textarea);
  document.body.append(body);
  const paste = vi.fn();
  registerEditorDrop(label, { insertAtCaret: vi.fn(), pasteAtCaret: paste });
  return { body, textarea, paste };
}

function harnessTab(ptyId: string): TabView {
  return { label: 'harness', view: 'harness', harness: { ptyId } } as unknown as TabView;
}

function noTab(): undefined {
  // No tab exposed, which is the shape of a session before its first state snapshot.
}

function setup(currentTab: () => TabView | undefined, dropRef: { current: CommandInputDropHandle | null }) {
  const client = { send: vi.fn() } as unknown as JanusClient;
  return { client, paste: createPasteCapability({ client, dropRef, currentTab }) };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('paste into whatever holds the caret', () => {
  it('inserts at the caret of the command bar', () => {
    const { textarea, handle } = commandBar();
    const dropRef = { current: handle };
    const { paste } = setup(noTab, dropRef);
    textarea.focus();

    paste('inserted', null);

    expect(handle.insertAtCaret).toHaveBeenCalledWith('inserted');
  });

  it('prefers the field the right-click landed on over the field holding the keyboard', () => {
    const { textarea, handle } = commandBar();
    const other = commandBar();
    const dropRef = { current: handle };
    const { paste } = setup(noTab, dropRef);
    textarea.focus();

    paste('into the clicked bar', other.textarea);

    expect(handle.insertAtCaret).toHaveBeenCalledWith('into the clicked bar');
  });

  // `isTextEntryElement` is true for the command bar's textarea and an editor's hidden one alike, so
  // "is a field focused" cannot tell them apart. What tells them apart is the marker each writes.
  it('finds the editor under the keyboard and pastes with paste semantics', () => {
    const { textarea, paste: editorPaste } = editor('notes');
    const { paste } = setup(noTab, { current: null });
    textarea.focus();

    paste('into the buffer', null);

    expect(editorPaste).toHaveBeenCalledWith('into the buffer');
  });

  it('types into a harness PTY, and does not submit it', () => {
    const { client, paste } = setup(() => harnessTab('pty-7'), { current: null });

    paste('typed at the prompt', null);

    expect(client.send).toHaveBeenCalledWith({ method: 'ptyInput', params: { id: 'pty-7', data: 'typed at the prompt' } });
    // No trailing Enter, unlike `typeIntoHarness` which exists to run a command on the user's behalf.
    expect(vi.mocked(client.send).mock.calls[0]?.[0]).not.toMatchObject({ params: { data: expect.stringContaining('\r') } });
  });

  it('falls back to the command bar when there is nothing else to paste into', () => {
    const { handle } = commandBar();
    const { paste } = setup(noTab, { current: handle });

    paste('nowhere in particular', null);

    expect(handle.insertAtCaret).toHaveBeenCalledWith('nowhere in particular');
  });

  it('does nothing at all when there is no surface to paste into', () => {
    const { client, paste } = setup(noTab, { current: null });

    paste('goes nowhere', null);

    expect(client.send).not.toHaveBeenCalled();
  });

  it('ignores an editor with no published handle, which is one no longer visible', () => {
    const body = document.createElement('div');
    body.dataset.editorDrop = 'gone';
    document.body.append(body);
    const { handle } = commandBar();
    const { paste } = setup(noTab, { current: handle });

    paste('lands in the bar', body);

    expect(handle.insertAtCaret).toHaveBeenCalledWith('lands in the bar');
  });
});

describe('the editor drop registry', () => {
  it('hands back the same handle it was given', () => {
    const handle = { insertAtCaret: vi.fn(), pasteAtCaret: vi.fn() };
    registerEditorDrop('a-label', handle);
    expect(editorDropHandle('a-label')).toBe(handle);
  });
});
