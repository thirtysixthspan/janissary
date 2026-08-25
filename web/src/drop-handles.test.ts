import { describe, expect, it, vi } from 'vitest';
import type { CommandInputDropHandle, EditorDropHandle } from './drop-handles';

// The drop handles are type-only, so these cases pin the shape the file navigator's drag code is
// allowed to call: a member dropped from either contract fails to compile here before it reaches
// a drop target at runtime.

describe('CommandInputDropHandle', () => {
  it('accepts a dropped path at the caret and toggles the drop highlight', () => {
    const insertAtCaret = vi.fn();
    const setDropHighlighted = vi.fn();
    const handle: CommandInputDropHandle = { insertAtCaret, setDropHighlighted };

    handle.insertAtCaret('src/index.ts');
    handle.setDropHighlighted(true);
    handle.setDropHighlighted(false);

    expect(insertAtCaret).toHaveBeenCalledWith('src/index.ts');
    expect(setDropHighlighted.mock.calls).toEqual([[true], [false]]);
  });
});

describe('EditorDropHandle', () => {
  it('accepts a dropped path at the cursor', () => {
    const insertAtCaret = vi.fn();
    const handle: EditorDropHandle = { insertAtCaret };

    handle.insertAtCaret('src/index.ts');

    expect(insertAtCaret).toHaveBeenCalledWith('src/index.ts');
  });

  it('is satisfied by a command-bar handle, which carries the highlight on top of it', () => {
    const commandBar: CommandInputDropHandle = { insertAtCaret: vi.fn(), setDropHighlighted: vi.fn() };
    const asEditorTarget: EditorDropHandle = commandBar;

    asEditorTarget.insertAtCaret('notes.md');

    expect(commandBar.insertAtCaret).toHaveBeenCalledWith('notes.md');
  });
});
