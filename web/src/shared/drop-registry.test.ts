import { describe, expect, it, vi } from 'vitest';
import { editorDropHandle, harnessDropHandle, registerEditorDrop, registerHarnessDrop } from './drop-registry';

describe('harness drop registry', () => {
  it('returns a registered handle by its PTY id', () => {
    const handle = { insertAtCaret: vi.fn() };
    const unregister = registerHarnessDrop('pty-1', handle);

    expect(harnessDropHandle('pty-1')).toBe(handle);

    unregister();
  });

  it('returns undefined for a PTY id nothing registered', () => {
    expect(harnessDropHandle('pty-never-registered')).toBeUndefined();
  });

  it('removes the handle when the returned function is called', () => {
    const unregister = registerHarnessDrop('pty-2', { insertAtCaret: vi.fn() });

    unregister();

    expect(harnessDropHandle('pty-2')).toBeUndefined();
  });

  it('replaces the handle when the same PTY id registers again', () => {
    const first = { insertAtCaret: vi.fn() };
    const second = { insertAtCaret: vi.fn() };
    registerHarnessDrop('pty-3', first);
    const unregister = registerHarnessDrop('pty-3', second);

    expect(harnessDropHandle('pty-3')).toBe(second);

    unregister();
  });

  it("keeps each harness's handle separate, so two visible tabs each get their own", () => {
    const left = { insertAtCaret: vi.fn() };
    const right = { insertAtCaret: vi.fn() };
    const unregisterLeft = registerHarnessDrop('pty-left', left);
    const unregisterRight = registerHarnessDrop('pty-right', right);

    harnessDropHandle('pty-right')?.insertAtCaret('src/index.ts');

    expect(right.insertAtCaret).toHaveBeenCalledWith('src/index.ts');
    expect(left.insertAtCaret).not.toHaveBeenCalled();

    unregisterLeft();
    unregisterRight();
  });

  // A remount can register the new handle before the old one's cleanup runs; that cleanup must not
  // remove the handle that replaced it.
  it('leaves a newer registration in place when an older one is removed', () => {
    const first = { insertAtCaret: vi.fn() };
    const second = { insertAtCaret: vi.fn() };
    const unregisterFirst = registerHarnessDrop('pty-4', first);
    const unregisterSecond = registerHarnessDrop('pty-4', second);

    unregisterFirst();

    expect(harnessDropHandle('pty-4')).toBe(second);
    unregisterSecond();
  });
});

describe('editor drop registry', () => {
  it('returns a registered handle by its tab label, and nothing once removed', () => {
    const handle = { insertAtCaret: vi.fn() };
    const unregister = registerEditorDrop('notes', handle);

    expect(editorDropHandle('notes')).toBe(handle);
    unregister();
    expect(editorDropHandle('notes')).toBeUndefined();
  });

  it('keeps editors and harnesses apart even under the same key', () => {
    const editor = { insertAtCaret: vi.fn() };
    const unregister = registerEditorDrop('shared-key', editor);

    expect(harnessDropHandle('shared-key')).toBeUndefined();
    expect(editorDropHandle('shared-key')).toBe(editor);
    unregister();
  });
});
