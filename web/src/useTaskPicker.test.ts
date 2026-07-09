import { render } from '@testing-library/react';
import React, { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useTaskPicker } from './useTaskPicker';

function TestComponent({ onHook }: { onHook: (hook: ReturnType<typeof useTaskPicker>) => void }) {
  const recallRef = useRef<((text: string) => void) | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hook = useTaskPicker(['build-a-feature.md'], recallRef, inputRef);
  onHook(hook);
  return null;
}

describe('useTaskPicker', () => {
  it('openTaskPicker resets the index to 0 and opens the popup', () => {
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    const { rerender } = render(React.createElement(TestComponent, { onHook: (h) => { hook = h; } }));
    hook!.setTaskPickerIndex(3);
    hook!.openTaskPicker();
    rerender(React.createElement(TestComponent, { onHook: (h) => { hook = h; } }));
    expect(hook!.taskPickerOpen).toBe(true);
    expect(hook!.taskPickerIndex).toBe(0);
  });

  it('pickTask populates the command line with execute ./ai/<name> and closes without submitting', () => {
    const recall = vi.fn();
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    function C() {
      const recallRef = useRef<((text: string) => void) | null>(recall);
      const inputRef = useRef<HTMLTextAreaElement>(null);
      hook = useTaskPicker(['fix-a-small-issue.md'], recallRef, inputRef);
      return null;
    }
    const { rerender } = render(React.createElement(C));
    hook!.openTaskPicker();
    rerender(React.createElement(C));
    hook!.pickTask('fix-a-small-issue.md');
    rerender(React.createElement(C));
    expect(recall).toHaveBeenCalledWith('execute ./ai/fix-a-small-issue.md');
    expect(hook!.taskPickerOpen).toBe(false);
  });
});
