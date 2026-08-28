import { describe, it, expect, vi } from 'vitest';
import { flattenVisibleTaskRows, firstSelectableIndex, handleTaskPickerKey, dispatchTaskPickerKey } from './task-picker-keys';
import type { TaskRow } from '@shared/protocol';
import type { VisibleTaskRow } from './task-picker-keys';

function fileRow(path: string, depth: number, source: TaskRow['source'] = 'project'): TaskRow {
  return { path, name: path.split('/').pop()!, depth, dir: false, source };
}

function dirRow(path: string, depth: number, source: TaskRow['source'] = 'project'): TaskRow {
  return { path, name: path.split('/').pop()!, depth, dir: true, source };
}

// A single-source tree (all project):
// top.md
// sub/            (collapsed by default)
//   nested.md
//   inner/        (collapsed by default)
//     deep.md
const rows: TaskRow[] = [
  fileRow('top.md', 0),
  dirRow('sub', 0),
  fileRow('sub/nested.md', 1),
  dirRow('sub/inner', 1),
  fileRow('sub/inner/deep.md', 2),
];

// Non-header row paths, dropping the section headers flatten inserts.
function taskPaths(visible: VisibleTaskRow[]): string[] {
  return visible.filter((r) => !r.header).map((r) => r.path);
}

describe('flattenVisibleTaskRows', () => {
  it('prepends a Project section header for a project-only tree', () => {
    const visible = flattenVisibleTaskRows(rows, new Set());
    expect(visible[0]).toMatchObject({ header: true, source: 'project', name: 'Project' });
    expect(taskPaths(visible)).toEqual(['top.md', 'sub']);
    expect(visible.find((r) => r.path === 'sub')!.expanded).toBe(false);
  });

  it('reveals a directory\'s direct children once expanded, keeping nested dirs collapsed', () => {
    const visible = flattenVisibleTaskRows(rows, new Set(['sub']));
    expect(taskPaths(visible)).toEqual(['top.md', 'sub', 'sub/nested.md', 'sub/inner']);
    expect(visible.find((r) => r.path === 'sub/inner')!.expanded).toBe(false);
  });

  it('reveals nested descendants once both ancestor directories are expanded', () => {
    const visible = flattenVisibleTaskRows(rows, new Set(['sub', 'sub/inner']));
    expect(taskPaths(visible)).toEqual(['top.md', 'sub', 'sub/nested.md', 'sub/inner', 'sub/inner/deep.md']);
  });

  it('emits a Project header then a Janissary header when both sources are present', () => {
    const twoSource: TaskRow[] = [fileRow('a.md', 0, 'project'), fileRow('b.md', 0, 'janissary')];
    const visible = flattenVisibleTaskRows(twoSource, new Set());
    expect(visible.map((r) => (r.header ? `#${r.name}` : r.path))).toEqual(['#Project', 'a.md', '#Janissary', 'b.md']);
  });

  it('emits only a Janissary header when the project source is empty', () => {
    const visible = flattenVisibleTaskRows([fileRow('b.md', 0, 'janissary')], new Set());
    expect(visible.map((r) => (r.header ? `#${r.name}` : r.path))).toEqual(['#Janissary', 'b.md']);
  });
});

describe('firstSelectableIndex', () => {
  it('skips a leading section header', () => {
    expect(firstSelectableIndex(flattenVisibleTaskRows(rows, new Set()))).toBe(1);
  });

  it('returns 0 for an empty list', () => {
    expect(firstSelectableIndex([])).toBe(0);
  });
});

describe('handleTaskPickerKey — selection movement', () => {
  const visible = flattenVisibleTaskRows(rows, new Set(['sub'])); // [#Project, top.md, sub, sub/nested, sub/inner]

  it('ArrowDown moves to the next visible row', () => {
    expect(handleTaskPickerKey(visible, 1, 'ArrowDown').index).toBe(2);
  });

  it('ArrowDown clamps at the last row', () => {
    expect(handleTaskPickerKey(visible, visible.length - 1, 'ArrowDown').index).toBe(visible.length - 1);
  });

  it('ArrowUp moves to the previous visible row', () => {
    expect(handleTaskPickerKey(visible, 3, 'ArrowUp').index).toBe(2);
  });

  it('ArrowUp from the first selectable row skips the header and stays put', () => {
    expect(handleTaskPickerKey(visible, 1, 'ArrowUp').index).toBe(1);
  });

  it('is a no-op when the selection is on a header row', () => {
    expect(handleTaskPickerKey(visible, 0, 'ArrowDown')).toEqual({ index: 0 });
  });

  it('returns index 0 for an empty row list', () => {
    expect(handleTaskPickerKey([], 0, 'ArrowDown').index).toBe(0);
  });
});

describe('handleTaskPickerKey — cross-section movement', () => {
  const twoSource: TaskRow[] = [fileRow('a.md', 0, 'project'), fileRow('b.md', 0, 'janissary')];
  const visible = flattenVisibleTaskRows(twoSource, new Set()); // [#Project, a.md, #Janissary, b.md]

  it('ArrowDown skips the Janissary header to land on the next task', () => {
    expect(handleTaskPickerKey(visible, 1, 'ArrowDown').index).toBe(3);
  });

  it('ArrowUp skips the Janissary header back to the previous task', () => {
    expect(handleTaskPickerKey(visible, 3, 'ArrowUp').index).toBe(1);
  });
});

describe('handleTaskPickerKey — expand/collapse/parent', () => {
  it('ArrowRight on a collapsed dir toggles it open, selection stays', () => {
    const visible = flattenVisibleTaskRows(rows, new Set());
    const result = handleTaskPickerKey(visible, 2, 'ArrowRight');
    expect(result.index).toBe(2);
    expect(result.action).toEqual({ type: 'toggle', path: 'sub' });
  });

  it('ArrowRight on an expanded dir moves selection to its first child', () => {
    const visible = flattenVisibleTaskRows(rows, new Set(['sub']));
    const result = handleTaskPickerKey(visible, 2, 'ArrowRight');
    expect(result.index).toBe(3);
    expect(result.action).toBeUndefined();
  });

  it('ArrowRight on a file is a no-op', () => {
    const visible = flattenVisibleTaskRows(rows, new Set());
    const result = handleTaskPickerKey(visible, 1, 'ArrowRight');
    expect(result).toEqual({ index: 1 });
  });

  it('ArrowLeft on an expanded dir collapses it', () => {
    const visible = flattenVisibleTaskRows(rows, new Set(['sub']));
    const result = handleTaskPickerKey(visible, 2, 'ArrowLeft');
    expect(result.index).toBe(2);
    expect(result.action).toEqual({ type: 'toggle', path: 'sub' });
  });

  it('ArrowLeft on a child moves selection to its parent directory', () => {
    const visible = flattenVisibleTaskRows(rows, new Set(['sub']));
    const result = handleTaskPickerKey(visible, 3, 'ArrowLeft');
    expect(result.index).toBe(2);
    expect(result.action).toBeUndefined();
  });

  it('ArrowLeft on a top-level row with no parent (only the header above) is a no-op', () => {
    const visible = flattenVisibleTaskRows([fileRow('a.md', 0), fileRow('b.md', 0)], new Set());
    const result = handleTaskPickerKey(visible, 1, 'ArrowLeft');
    expect(result.index).toBe(1);
    expect(result.action).toBeUndefined();
  });
});

describe('handleTaskPickerKey — activation', () => {
  const visible = flattenVisibleTaskRows(rows, new Set()); // [#Project, top.md, sub]

  it('Enter on a directory toggles it', () => {
    expect(handleTaskPickerKey(visible, 2, 'Enter').action).toEqual({ type: 'toggle', path: 'sub' });
  });

  it('Enter on a file picks it', () => {
    expect(handleTaskPickerKey(visible, 1, 'Enter').action).toEqual({ type: 'pick', path: 'top.md' });
  });

  it('Enter on a header row is a no-op', () => {
    expect(handleTaskPickerKey(visible, 0, 'Enter')).toEqual({ index: 0 });
  });

  it('Escape closes', () => {
    expect(handleTaskPickerKey(visible, 1, 'Escape').action).toEqual({ type: 'close' });
  });
});

describe('dispatchTaskPickerKey', () => {
  function keyEvent(key: string): KeyboardEvent {
    return { key, preventDefault: vi.fn() } as unknown as KeyboardEvent;
  }

  it('calls preventDefault and pickTask for Enter on a file', () => {
    const visible = flattenVisibleTaskRows(rows, new Set());
    const pickTask = vi.fn();
    const toggleDir = vi.fn();
    const e = keyEvent('Enter');
    dispatchTaskPickerKey(e, visible, 1, vi.fn(), toggleDir, pickTask, vi.fn());
    expect(e.preventDefault).toHaveBeenCalled();
    expect(pickTask).toHaveBeenCalledWith('top.md');
    expect(toggleDir).not.toHaveBeenCalled();
  });

  it('calls toggleDir for Enter on a directory', () => {
    const visible = flattenVisibleTaskRows(rows, new Set());
    const toggleDir = vi.fn();
    const e = keyEvent('Enter');
    dispatchTaskPickerKey(e, visible, 2, vi.fn(), toggleDir, vi.fn(), vi.fn());
    expect(toggleDir).toHaveBeenCalledWith('sub');
  });

  it('ignores unhandled keys', () => {
    const visible = flattenVisibleTaskRows(rows, new Set());
    const setIndex = vi.fn();
    const e = keyEvent('a');
    dispatchTaskPickerKey(e, visible, 1, setIndex, vi.fn(), vi.fn(), vi.fn());
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(setIndex).not.toHaveBeenCalled();
  });
});
