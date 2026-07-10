import { useCallback, useMemo, useState } from 'react';
import type { TaskRow } from '@shared/protocol';
import { flattenVisibleTaskRows } from './task-picker-keys';

// State and handlers for the Ctrl+A / `tasks` picker. Mirrors the queue picker's
// populate-not-submit shape (not `hist`'s run-immediately shape): selecting a task writes
// `execute ./ai/tasks/<path>` into the command line via the shared recall ref and closes the
// popup, so the user can supplement or edit the command before running it themselves.
export function useTaskPicker(
  tasks: TaskRow[],
  recallRef: React.RefObject<((text: string) => void) | null>,
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
) {
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [taskPickerIndex, setTaskPickerIndex] = useState(0);
  const [expandedTaskDirs, setExpandedTaskDirs] = useState<Set<string>>(new Set());

  const openTaskPicker = useCallback(() => {
    setTaskPickerIndex(0);
    setTaskPickerOpen(true);
  }, []);

  const pickTask = useCallback((path: string) => {
    recallRef.current?.(`execute ./ai/tasks/${path}`);
    setTaskPickerOpen(false);
    inputRef.current?.focus();
  }, [recallRef, inputRef]);

  const toggleTaskDir = useCallback((path: string) => {
    setExpandedTaskDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const visibleTasks = useMemo(() => flattenVisibleTaskRows(tasks, expandedTaskDirs), [tasks, expandedTaskDirs]);

  return {
    taskPickerOpen, taskPickerIndex, setTaskPickerIndex, setTaskPickerOpen, openTaskPicker, pickTask,
    visibleTasks, toggleTaskDir,
  };
}
