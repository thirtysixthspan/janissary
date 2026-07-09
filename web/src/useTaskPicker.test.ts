import { render } from '@testing-library/react';
import React, { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useTaskPicker } from './useTaskPicker';
import type { TaskRow } from '@shared/protocol';

function fileRow(path: string, depth = 0): TaskRow {
  return { path, name: path.split('/').pop()!, depth, dir: false };
}

function dirRow(path: string, depth = 0): TaskRow {
  return { path, name: path.split('/').pop()!, depth, dir: true };
}

function TestComponent({ tasks, onHook }: { tasks: TaskRow[]; onHook: (hook: ReturnType<typeof useTaskPicker>) => void }) {
  const recallRef = useRef<((text: string) => void) | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hook = useTaskPicker(tasks, recallRef, inputRef);
  onHook(hook);
  return null;
}

describe('useTaskPicker', () => {
  it('openTaskPicker resets the index to 0 and opens the popup', () => {
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    const tasks = [fileRow('build-a-feature.md')];
    const { rerender } = render(React.createElement(TestComponent, { tasks, onHook: (h) => { hook = h; } }));
    hook!.setTaskPickerIndex(3);
    hook!.openTaskPicker();
    rerender(React.createElement(TestComponent, { tasks, onHook: (h) => { hook = h; } }));
    expect(hook!.taskPickerOpen).toBe(true);
    expect(hook!.taskPickerIndex).toBe(0);
  });

  it('pickTask populates the command line with execute ./ai/<path> and closes without submitting', () => {
    const recall = vi.fn();
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    function C() {
      const recallRef = useRef<((text: string) => void) | null>(recall);
      const inputRef = useRef<HTMLTextAreaElement>(null);
      hook = useTaskPicker([fileRow('fix-a-small-issue.md')], recallRef, inputRef);
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

  it('visibleTasks hides a directory\'s children until toggleTaskDir expands it', () => {
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    const tasks = [dirRow('sub'), fileRow('sub/nested.md', 1), fileRow('top.md')];
    const { rerender } = render(React.createElement(TestComponent, { tasks, onHook: (h) => { hook = h; } }));
    expect(hook!.visibleTasks.map((r) => r.path)).toEqual(['sub', 'top.md']);

    hook!.toggleTaskDir('sub');
    rerender(React.createElement(TestComponent, { tasks, onHook: (h) => { hook = h; } }));
    expect(hook!.visibleTasks.map((r) => r.path)).toEqual(['sub', 'sub/nested.md', 'top.md']);

    hook!.toggleTaskDir('sub');
    rerender(React.createElement(TestComponent, { tasks, onHook: (h) => { hook = h; } }));
    expect(hook!.visibleTasks.map((r) => r.path)).toEqual(['sub', 'top.md']);
  });
});
