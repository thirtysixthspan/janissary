import { act, render } from '@testing-library/react';
import React, { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useTaskPicker } from './useTaskPicker';
import type { TaskRow } from '@shared/protocol';
import type { JanusClient } from '../shared/ws/ws';
import type { CommandInputDropHandle } from '../shared/drop-handles';

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
  const hook = useTaskPicker(tasks, mockClient, undefined, dropRef, vi.fn());
  onHook(hook);
  return null;
}

describe('useTaskPicker', () => {
  it('openTaskPicker seats the index on the first selectable row (past the section header) and opens the popup', () => {
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    const tasks = [fileRow('work-an-issue.md')];
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
      hook = useTaskPicker([dirRow('feature'), fileRow('feature/work-pull-request-issue.md', 1)], mockClient, undefined, dropRef, vi.fn());
      return null;
    }
    render(React.createElement(C));
    act(() => hook!.openTaskPicker());
    act(() => hook!.toggleTaskDir({ path: 'feature', source: 'project' }));
    act(() => hook!.pickTask({ path: 'feature/work-pull-request-issue.md', source: 'project' }));
    expect(insertAtCaret).toHaveBeenCalledWith('execute ./ai/tasks/feature/work-pull-request-issue.md');
    expect(hook!.taskPickerOpen).toBe(false);
  });

  it('pickTask on a janissary-source task inserts execute $janissary/ai/tasks/<path>', () => {
    const insertAtCaret = vi.fn();
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    function C() {
      const dropRef = useRef<CommandInputDropHandle | null>(makeDrop(insertAtCaret));
      hook = useTaskPicker([dirRow('feature', 0, 'janissary'), fileRow('feature/build-a-feature.md', 1, 'janissary')], mockClient, undefined, dropRef, vi.fn());
      return null;
    }
    render(React.createElement(C));
    act(() => hook!.openTaskPicker());
    act(() => hook!.toggleTaskDir({ path: 'feature', source: 'janissary' }));
    act(() => hook!.pickTask({ path: 'feature/build-a-feature.md', source: 'janissary' }));
    expect(insertAtCaret).toHaveBeenCalledWith('execute $janissary/ai/tasks/feature/build-a-feature.md');
    expect(hook!.taskPickerOpen).toBe(false);
  });

  it('keeps expansion independent and routes an overlapping built-in task by its selected source', () => {
    const insertAtCaret = vi.fn();
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    const tasks = [
      dirRow('research', 0, 'project'), fileRow('research/local.md', 1, 'project'),
      dirRow('research', 0, 'janissary'), fileRow('research/audit.md', 1, 'janissary'),
    ];
    function C() {
      const dropRef = useRef<CommandInputDropHandle | null>(makeDrop(insertAtCaret));
      hook = useTaskPicker(tasks, mockClient, undefined, dropRef, vi.fn());
      return null;
    }
    render(React.createElement(C));
    act(() => hook!.toggleTaskDir({ path: 'research', source: 'project' }));

    expect(hook!.visibleTasks.filter((row) => !row.header).map((row) => `${row.source}:${row.path}`)).toEqual([
      'project:research', 'project:research/local.md', 'janissary:research',
    ]);

    act(() => hook!.toggleTaskDir({ path: 'research', source: 'janissary' }));
    act(() => hook!.pickTask({ path: 'research/audit.md', source: 'janissary' }));
    expect(insertAtCaret).toHaveBeenCalledWith('execute $janissary/ai/tasks/research/audit.md');
  });

  it('pickTask sends ptyInput to the harness when harnessPtyId is set, instead of the command line', () => {
    const insertAtCaret = vi.fn();
    const send = vi.fn();
    const client = { send, request: vi.fn() } as unknown as JanusClient;
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    function C() {
      const dropRef = useRef<CommandInputDropHandle | null>(makeDrop(insertAtCaret));
      hook = useTaskPicker([fileRow('fix-a-small-issue.md')], client, 'pty-1', dropRef, vi.fn());
      return null;
    }
    render(React.createElement(C));
    act(() => hook!.openTaskPicker());
    act(() => hook!.pickTask({ path: 'fix-a-small-issue.md', source: 'project' }));
    expect(send).toHaveBeenCalledWith({ method: 'ptyInput', params: { id: 'pty-1', data: 'execute ./ai/tasks/fix-a-small-issue.md' } });
    expect(insertAtCaret).not.toHaveBeenCalled();
    expect(hook!.taskPickerOpen).toBe(false);
  });

  it('pickTask sends the $janissary form into the harness for a janissary-source task', () => {
    const send = vi.fn();
    const client = { send, request: vi.fn() } as unknown as JanusClient;
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    function C() {
      const dropRef = useRef<CommandInputDropHandle | null>(makeDrop());
      hook = useTaskPicker([fileRow('work-an-issue.md', 0, 'janissary')], client, 'pty-1', dropRef, vi.fn());
      return null;
    }
    render(React.createElement(C));
    act(() => hook!.openTaskPicker());
    act(() => hook!.pickTask({ path: 'work-an-issue.md', source: 'janissary' }));
    expect(send).toHaveBeenCalledWith({
      method: 'ptyInput',
      params: { id: 'pty-1', data: 'execute $janissary/ai/tasks/work-an-issue.md' },
    });
  });

  it('pickTask hands the keyboard back to the harness after typing into its PTY', () => {
    const send = vi.fn();
    const client = { send, request: vi.fn() } as unknown as JanusClient;
    const focusHarness = vi.fn(() => {
      expect(send).toHaveBeenCalledWith({ method: 'ptyInput', params: { id: 'pty-1', data: 'execute ./ai/tasks/fix-a-small-issue.md' } });
    });
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    function C() {
      const dropRef = useRef<CommandInputDropHandle | null>(makeDrop());
      hook = useTaskPicker([fileRow('fix-a-small-issue.md')], client, 'pty-1', dropRef, focusHarness);
      return null;
    }
    render(React.createElement(C));
    act(() => hook!.openTaskPicker());
    act(() => hook!.pickTask({ path: 'fix-a-small-issue.md', source: 'project' }));
    expect(focusHarness).toHaveBeenCalledExactlyOnceWith('pty-1');
  });

  it('pickTask leaves focus alone when it inserts into the command line', () => {
    const focusHarness = vi.fn();
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    function C() {
      const dropRef = useRef<CommandInputDropHandle | null>(makeDrop());
      hook = useTaskPicker([fileRow('fix-a-small-issue.md')], mockClient, undefined, dropRef, focusHarness);
      return null;
    }
    render(React.createElement(C));
    act(() => hook!.openTaskPicker());
    act(() => hook!.pickTask({ path: 'fix-a-small-issue.md', source: 'project' }));
    expect(focusHarness).not.toHaveBeenCalled();
  });

  it('re-seats the index onto a selectable row when a re-render leaves it past the end', () => {
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    const onHook = (h: ReturnType<typeof useTaskPicker>) => { hook = h; };
    const tasks = [fileRow('a.md'), fileRow('b.md'), fileRow('c.md')];
    const { rerender } = render(React.createElement(TestComponent, { tasks, onHook }));
    act(() => { hook!.openTaskPicker(); hook!.setTaskPickerIndex(3); });
    expect(hook!.taskPickerIndex).toBe(3);

    rerender(React.createElement(TestComponent, { tasks: [fileRow('a.md')], onHook }));
    expect(hook!.taskPickerIndex).toBe(1);
    expect(hook!.visibleTasks[hook!.taskPickerIndex].header).toBeUndefined();
  });

  it('re-seats the index off a section header when the list shifts under it', () => {
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    const onHook = (h: ReturnType<typeof useTaskPicker>) => { hook = h; };
    const tasks = [fileRow('a.md'), fileRow('b.md'), fileRow('c.md', 0, 'janissary')];
    const { rerender } = render(React.createElement(TestComponent, { tasks, onHook }));
    act(() => { hook!.openTaskPicker(); hook!.setTaskPickerIndex(2); });

    rerender(React.createElement(TestComponent, { tasks: [fileRow('a.md'), fileRow('c.md', 0, 'janissary')], onHook }));
    expect(hook!.visibleTasks[2].header).toBe(true);
    expect(hook!.taskPickerIndex).toBe(3);
  });

  it('visibleTasks hides a directory\'s children until toggleTaskDir expands it', () => {
    let hook: ReturnType<typeof useTaskPicker> | undefined;
    const tasks = [dirRow('sub'), fileRow('sub/nested.md', 1), fileRow('top.md')];
    const paths = () => hook!.visibleTasks.filter((r) => !r.header).map((r) => r.path);
    render(React.createElement(TestComponent, { tasks, onHook: (h) => { hook = h; } }));
    expect(paths()).toEqual(['sub', 'top.md']);

    act(() => hook!.toggleTaskDir({ path: 'sub', source: 'project' }));
    expect(paths()).toEqual(['sub', 'sub/nested.md', 'top.md']);

    act(() => hook!.toggleTaskDir({ path: 'sub', source: 'project' }));
    expect(paths()).toEqual(['sub', 'top.md']);
  });
});
