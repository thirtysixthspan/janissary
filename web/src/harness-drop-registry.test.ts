import { describe, expect, it, vi } from 'vitest';
import { harnessDropHandle, registerHarnessDrop } from './harness-drop-registry';

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
});
