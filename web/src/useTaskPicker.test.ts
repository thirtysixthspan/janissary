import { act, render } from '@testing-library/react';
import React, { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useTaskPicker } from './useTaskPicker';
import type { TaskRow } from '@shared/protocol';
import type { JanusClient } from './ws';
import type { CommandInputDropHandle } from './CommandInput';

function fileRow(path: string, depth = 0, source: TaskRow['source'] = 'project'): TaskRow {
  return { path, name: path.split('/').pop()!, depth, dir: false, source };
}

function dirRow(path: string, depth = 0, source: TaskRow['source'] = 'project'): TaskRow {
  return { path, name: path.split('/').pop()!, depth, dir: true, source };
}

const mockClient = { send: vi.fn(), request: vi.fn() } as unknown as JanusClient;

function makeDrop(insertAtCaret = vi.fn()): CommandInputDropHandle {
  return { insertAtCaret, setDropHighlighted: vi.fn() };
}

function TestComponent({ tasks, onHook }: { tasks: TaskRow[]; onHook: (hook: ReturnType<typeof useTaskPicker>) => void }) {
  const dropRef = useRef<CommandInputDropHandle | null>(makeDrop());
  const hook = useTaskPicker(tasks, '/janissary/ai/tasks', mockClient, undefined, dropRef);
  onHook(hook);
  return null;
}

describe('useTaskPicker', () => {
  it('openTaskPicker seats the index on the first selectable row (past the section header) and opens the popup', () => {
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    const tasks = [fileRow('build-a-feature.md')];
    render(React.createElement(TestComponent, { tasks, onHook: (h) => { hook = h; } }));
    act(() => { hook!.setTaskPickerIndex(3); hook!.openTaskPicker(); });
    expect(hook!.taskPickerOpen).toBe(true);
    expect(hook!.taskPickerIndex).toBe(1);
  });

  it('pickTask inserts execute ./ai/tasks/<path> at the cursor and closes without submitting', () => {
    const insertAtCaret = vi.fn();
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    function C() {
      const dropRef = useRef<CommandInputDropHandle | null>(makeDrop(insertAtCaret));
      hook = useTaskPicker([fileRow('fix-a-small-issue.md')], '/janissary/ai/tasks', mockClient, undefined, dropRef);
      return null;
    }
    render(React.createElement(C));
    act(() => hook!.openTaskPicker());
    act(() => hook!.pickTask('fix-a-small-issue.md'));
    expect(insertAtCaret).toHaveBeenCalledWith('execute ./ai/tasks/fix-a-small-issue.md');
    expect(hook!.taskPickerOpen).toBe(false);
  });

  it('pickTask on a janissary-source task inserts the absolute execute <janissaryTasksDir>/<path>', () => {
    const insertAtCaret = vi.fn();
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    function C() {
      const dropRef = useRef<CommandInputDropHandle | null>(makeDrop(insertAtCaret));
      hook = useTaskPicker([fileRow('build-a-feature.md', 0, 'janissary')], '/opt/janissary/ai/tasks', mockClient, undefined, dropRef);
      return null;
    }
    render(React.createElement(C));
    act(() => hook!.openTaskPicker());
    act(() => hook!.pickTask('build-a-feature.md'));
    expect(insertAtCaret).toHaveBeenCalledWith('execute /opt/janissary/ai/tasks/build-a-feature.md');
    expect(hook!.taskPickerOpen).toBe(false);
  });

  it('pickTask sends ptyInput to the harness when harnessPtyId is set, instead of the command line', () => {
    const insertAtCaret = vi.fn();
    const send = vi.fn();
    const client = { send, request: vi.fn() } as unknown as JanusClient;
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    function C() {
      const dropRef = useRef<CommandInputDropHandle | null>(makeDrop(insertAtCaret));
      hook = useTaskPicker([fileRow('fix-a-small-issue.md')], '/janissary/ai/tasks', client, 'pty-1', dropRef);
      return null;
    }
    render(React.createElement(C));
    act(() => hook!.openTaskPicker());
    act(() => hook!.pickTask('fix-a-small-issue.md'));
    expect(send).toHaveBeenCalledWith({ method: 'ptyInput', params: { id: 'pty-1', data: 'execute ./ai/tasks/fix-a-small-issue.md' } });
    expect(insertAtCaret).not.toHaveBeenCalled();
    expect(hook!.taskPickerOpen).toBe(false);
  });

  it('visibleTasks hides a directory\'s children until toggleTaskDir expands it', () => {
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    const tasks = [dirRow('sub'), fileRow('sub/nested.md', 1), fileRow('top.md')];
    const paths = () => hook!.visibleTasks.filter((r) => !r.header).map((r) => r.path);
    render(React.createElement(TestComponent, { tasks, onHook: (h) => { hook = h; } }));
    expect(paths()).toEqual(['sub', 'top.md']);

    act(() => hook!.toggleTaskDir('sub'));
    expect(paths()).toEqual(['sub', 'sub/nested.md', 'top.md']);

    act(() => hook!.toggleTaskDir('sub'));
    expect(paths()).toEqual(['sub', 'top.md']);
  });
});
