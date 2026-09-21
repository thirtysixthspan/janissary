import { describe, expect, it, vi } from 'vitest';
import type { HarnessTabHandle, ShellTabHandle, QuestionPanelHandle } from './tab-handles';

// The focus handles are type-only, so these cases pin the shape the focus hooks are allowed to
// call: a member dropped from either contract fails to compile here before it reaches a tab
// surface at runtime.

describe('HarnessTabHandle', () => {
  it('accepts a focus implementation and invokes it', () => {
    const focus = vi.fn();
    const handle: HarnessTabHandle = { focus };

    handle.focus();

    expect(focus).toHaveBeenCalledTimes(1);
  });
});

describe('ShellTabHandle', () => {
  it('accepts a focus implementation and invokes it', () => {
    const focus = vi.fn();
    const handle: ShellTabHandle = { focus };

    handle.focus();

    expect(focus).toHaveBeenCalledTimes(1);
  });
});

describe('QuestionPanelHandle', () => {
  it('accepts a focusCancel implementation and invokes it', () => {
    const focusCancel = vi.fn();
    const handle: QuestionPanelHandle = { focusCancel };

    handle.focusCancel();

    expect(focusCancel).toHaveBeenCalledTimes(1);
  });
});
