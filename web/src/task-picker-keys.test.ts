import { describe, it, expect, vi } from 'vitest';
import { flattenVisibleTaskRows, handleTaskPickerKey, dispatchTaskPickerKey } from './task-picker-keys';
import type { TaskRow } from '@shared/protocol';
import type { VisibleTaskRow } from './task-picker-keys';

function fileRow(path: string, depth: number): TaskRow {
  return { path, name: path.split('/').pop()!, depth, dir: false };
}

function dirRow(path: string, depth: number): TaskRow {
  return { path, name: path.split('/').pop()!, depth, dir: true };
}

// A tree:
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

describe('flattenVisibleTaskRows', () => {
  it('hides a collapsed directory\'s descendants', () => {
    const visible = flattenVisibleTaskRows(rows, new Set());
    expect(visible.map((r) => r.path)).toEqual(['top.md', 'sub']);
    expect(visible.find((r) => r.path === 'sub')!.expanded).toBe(false);
  });

  it('reveals a directory\'s direct children once expanded, keeping nested dirs collapsed', () => {
    const visible = flattenVisibleTaskRows(rows, new Set(['sub']));
    expect(visible.map((r) => r.path)).toEqual(['top.md', 'sub', 'sub/nested.md', 'sub/inner']);
    expect(visible.find((r) => r.path === 'sub/inner')!.expanded).toBe(false);
  });

  it('reveals nested descendants once both ancestor directories are expanded', () => {
    const visible = flattenVisibleTaskRows(rows, new Set(['sub', 'sub/inner']));
    expect(visible.map((r) => r.path)).toEqual(['top.md', 'sub', 'sub/nested.md', 'sub/inner', 'sub/inner/deep.md']);
  });
});

describe('handleTaskPickerKey — selection movement', () => {
  const visible = flattenVisibleTaskRows(rows, new Set(['sub']));

  it('ArrowDown moves to the next visible row', () => {
    expect(handleTaskPickerKey(visible, 0, 'ArrowDown').index).toBe(1);
  });

  it('ArrowDown clamps at the last row', () => {
    expect(handleTaskPickerKey(visible, visible.length - 1, 'ArrowDown').index).toBe(visible.length - 1);
  });

  it('ArrowUp moves to the previous visible row', () => {
    expect(handleTaskPickerKey(visible, 2, 'ArrowUp').index).toBe(1);
  });

  it('ArrowUp clamps at the first row', () => {
    expect(handleTaskPickerKey(visible, 0, 'ArrowUp').index).toBe(0);
  });

  it('returns index 0 for an empty row list', () => {
    expect(handleTaskPickerKey([], 0, 'ArrowDown').index).toBe(0);
  });
});

describe('handleTaskPickerKey — expand/collapse/parent', () => {
  it('ArrowRight on a collapsed dir toggles it open, selection stays', () => {
    const visible = flattenVisibleTaskRows(rows, new Set());
    const result = handleTaskPickerKey(visible, 1, 'ArrowRight');
    expect(result.index).toBe(1);
    expect(result.action).toEqual({ type: 'toggle', path: 'sub' });
  });

  it('ArrowRight on an expanded dir moves selection to its first child', () => {
    const visible = flattenVisibleTaskRows(rows, new Set(['sub']));
    const result = handleTaskPickerKey(visible, 1, 'ArrowRight');
    expect(result.index).toBe(2);
    expect(result.action).toBeUndefined();
  });

  it('ArrowRight on a file is a no-op', () => {
    const visible = flattenVisibleTaskRows(rows, new Set());
    const result = handleTaskPickerKey(visible, 0, 'ArrowRight');
    expect(result).toEqual({ index: 0 });
  });

  it('ArrowLeft on an expanded dir collapses it', () => {
    const visible = flattenVisibleTaskRows(rows, new Set(['sub']));
    const result = handleTaskPickerKey(visible, 1, 'ArrowLeft');
    expect(result.index).toBe(1);
    expect(result.action).toEqual({ type: 'toggle', path: 'sub' });
  });

  it('ArrowLeft on a child moves selection to its parent directory', () => {
    const visible = flattenVisibleTaskRows(rows, new Set(['sub']));
    const result = handleTaskPickerKey(visible, 2, 'ArrowLeft');
    expect(result.index).toBe(1);
    expect(result.action).toBeUndefined();
  });

  it('ArrowLeft on a top-level row with no parent is a no-op', () => {
    const flat: VisibleTaskRow[] = [fileRow('a.md', 0), fileRow('b.md', 0)];
    const result = handleTaskPickerKey(flat, 0, 'ArrowLeft');
    expect(result.index).toBe(0);
    expect(result.action).toBeUndefined();
  });
});

describe('handleTaskPickerKey — activation', () => {
  it('Enter on a directory toggles it', () => {
    const visible = flattenVisibleTaskRows(rows, new Set());
    const result = handleTaskPickerKey(visible, 1, 'Enter');
    expect(result.action).toEqual({ type: 'toggle', path: 'sub' });
  });

  it('Enter on a file picks it', () => {
    const visible = flattenVisibleTaskRows(rows, new Set());
    const result = handleTaskPickerKey(visible, 0, 'Enter');
    expect(result.action).toEqual({ type: 'pick', path: 'top.md' });
  });

  it('Escape closes', () => {
    const visible = flattenVisibleTaskRows(rows, new Set());
    const result = handleTaskPickerKey(visible, 0, 'Escape');
    expect(result.action).toEqual({ type: 'close' });
  });
});

describe('dispatchTaskPickerKey', () => {
  function keyEvent(key: string): KeyboardEvent {
    return { key, preventDefault: vi.fn() } as unknown as KeyboardEvent;
  }

  it('calls preventDefault and pickTask for Enter on a file', () => {
    const visible = flattenVisibleTaskRows(rows, new Set());
    const setIndex = vi.fn();
    const toggleDir = vi.fn();
    const pickTask = vi.fn();
    const setOpen = vi.fn();
    const e = keyEvent('Enter');
    dispatchTaskPickerKey(e, visible, 0, setIndex, toggleDir, pickTask, setOpen);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(pickTask).toHaveBeenCalledWith('top.md');
    expect(toggleDir).not.toHaveBeenCalled();
  });

  it('calls toggleDir for Enter on a directory', () => {
    const visible = flattenVisibleTaskRows(rows, new Set());
    const setIndex = vi.fn();
    const toggleDir = vi.fn();
    const e = keyEvent('Enter');
    dispatchTaskPickerKey(e, visible, 1, setIndex, toggleDir, vi.fn(), vi.fn());
    expect(toggleDir).toHaveBeenCalledWith('sub');
  });

  it('ignores unhandled keys', () => {
    const visible = flattenVisibleTaskRows(rows, new Set());
    const setIndex = vi.fn();
    const e = keyEvent('a');
    dispatchTaskPickerKey(e, visible, 0, setIndex, vi.fn(), vi.fn(), vi.fn());
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(setIndex).not.toHaveBeenCalled();
  });
});
