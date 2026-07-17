import { render } from '@testing-library/react';
import React, { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useTaskPicker } from './useTaskPicker';
import type { TaskRow } from '@shared/protocol';
import type { JanusClient } from './ws';

function fileRow(path: string, depth = 0, source: TaskRow['source'] = 'project'): TaskRow {
  return { path, name: path.split('/').pop()!, depth, dir: false, source };
}

function dirRow(path: string, depth = 0, source: TaskRow['source'] = 'project'): TaskRow {
  return { path, name: path.split('/').pop()!, depth, dir: true, source };
}

const mockClient = { send: vi.fn(), request: vi.fn() } as unknown as JanusClient;

function TestComponent({ tasks, onHook }: { tasks: TaskRow[]; onHook: (hook: ReturnType<typeof useTaskPicker>) => void }) {
  const recallRef = useRef<((text: string) => void) | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hook = useTaskPicker(tasks, '/janissary/ai/tasks', recallRef, inputRef, mockClient, undefined);
  onHook(hook);
  return null;
}

describe('useTaskPicker', () => {
  it('openTaskPicker seats the index on the first selectable row (past the section header) and opens the popup', () => {
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    const tasks = [fileRow('build-a-feature.md')];
    const { rerender } = render(React.createElement(TestComponent, { tasks, onHook: (h) => { hook = h; } }));
    hook!.setTaskPickerIndex(3);
    hook!.openTaskPicker();
    rerender(React.createElement(TestComponent, { tasks, onHook: (h) => { hook = h; } }));
    expect(hook!.taskPickerOpen).toBe(true);
    expect(hook!.taskPickerIndex).toBe(1);
  });

  it('pickTask populates the command line with execute ./ai/tasks/<path> and closes without submitting', () => {
    const recall = vi.fn();
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    function C() {
      const recallRef = useRef<((text: string) => void) | null>(recall);
      const inputRef = useRef<HTMLTextAreaElement>(null);
      hook = useTaskPicker([fileRow('fix-a-small-issue.md')], '/janissary/ai/tasks', recallRef, inputRef, mockClient, undefined);
      return null;
    }
    const { rerender } = render(React.createElement(C));
    hook!.openTaskPicker();
    rerender(React.createElement(C));
    hook!.pickTask('fix-a-small-issue.md');
    rerender(React.createElement(C));
    expect(recall).toHaveBeenCalledWith('execute ./ai/tasks/fix-a-small-issue.md');
    expect(hook!.taskPickerOpen).toBe(false);
  });

  it('pickTask on a janissary-source task populates the absolute execute <janissaryTasksDir>/<path>', () => {
    const recall = vi.fn();
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    function C() {
      const recallRef = useRef<((text: string) => void) | null>(recall);
      const inputRef = useRef<HTMLTextAreaElement>(null);
      hook = useTaskPicker([fileRow('build-a-feature.md', 0, 'janissary')], '/opt/janissary/ai/tasks', recallRef, inputRef, mockClient, undefined);
      return null;
    }
    const { rerender } = render(React.createElement(C));
    hook!.openTaskPicker();
    rerender(React.createElement(C));
    hook!.pickTask('build-a-feature.md');
    rerender(React.createElement(C));
    expect(recall).toHaveBeenCalledWith('execute /opt/janissary/ai/tasks/build-a-feature.md');
    expect(hook!.taskPickerOpen).toBe(false);
  });

  it('pickTask sends ptyInput to the harness when harnessPtyId is set, instead of the command line', () => {
    const recall = vi.fn();
    const send = vi.fn();
    const client = { send, request: vi.fn() } as unknown as JanusClient;
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    function C() {
      const recallRef = useRef<((text: string) => void) | null>(recall);
      const inputRef = useRef<HTMLTextAreaElement>(null);
      hook = useTaskPicker([fileRow('fix-a-small-issue.md')], '/janissary/ai/tasks', recallRef, inputRef, client, 'pty-1');
      return null;
    }
    const { rerender } = render(React.createElement(C));
    hook!.openTaskPicker();
    rerender(React.createElement(C));
    hook!.pickTask('fix-a-small-issue.md');
    rerender(React.createElement(C));
    expect(send).toHaveBeenCalledWith({ method: 'ptyInput', params: { id: 'pty-1', data: 'execute ./ai/tasks/fix-a-small-issue.md' } });
    expect(recall).not.toHaveBeenCalled();
    expect(hook!.taskPickerOpen).toBe(false);
  });

  it('visibleTasks hides a directory\'s children until toggleTaskDir expands it', () => {
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    const tasks = [dirRow('sub'), fileRow('sub/nested.md', 1), fileRow('top.md')];
    const paths = () => hook!.visibleTasks.filter((r) => !r.header).map((r) => r.path);
    const { rerender } = render(React.createElement(TestComponent, { tasks, onHook: (h) => { hook = h; } }));
    expect(paths()).toEqual(['sub', 'top.md']);

    hook!.toggleTaskDir('sub');
    rerender(React.createElement(TestComponent, { tasks, onHook: (h) => { hook = h; } }));
    expect(paths()).toEqual(['sub', 'sub/nested.md', 'top.md']);

    hook!.toggleTaskDir('sub');
    rerender(React.createElement(TestComponent, { tasks, onHook: (h) => { hook = h; } }));
    expect(paths()).toEqual(['sub', 'top.md']);
  });
});
