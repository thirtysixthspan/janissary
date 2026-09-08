import { useCallback, useMemo, useState } from 'react';
import type { TaskRow } from '@shared/protocol';
import type { JanusClient } from '../ws';
import type { CommandInputDropHandle } from '../drop-handles';
import { flattenVisibleTaskRows, firstSelectableIndex } from './task-picker-keys';
import { insertIntoCommandLine } from './populate-command-line';

// State and handlers for the Ctrl+A / `tasks` picker. Selecting a task inserts an `execute …`
// command at the command line's current cursor (via the shared drop handle's `insertAtCaret`),
// leaving the rest of the line intact, and closes the popup — so the user can supplement or edit the
// command before running it themselves. A project task inserts the relative `execute ./ai/tasks/<path>`;
// a built-in (Janissary) task inserts `execute $janissary/ai/tasks/<path>`, where `$janissary` is the
// install root of whichever janissary spawned the agent — every spawned process is handed it (see
// src/janissary-root.ts), so the command resolves from any working directory and, unlike an absolute
// path this client could build, names the right installation when the agent runs on a remote machine.
// On a harness tab there is no command line, so the same text is sent straight into that harness's
// PTY input.
export function useTaskPicker(
  tasks: TaskRow[],
  client: JanusClient,
  harnessPtyId: string | undefined,
  dropRef: React.RefObject<CommandInputDropHandle | null>,
) {
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [taskPickerIndex, setTaskPickerIndex] = useState(0);
  const [expandedTaskDirs, setExpandedTaskDirs] = useState<Set<string>>(new Set());

  const visibleTasks = useMemo(() => flattenVisibleTaskRows(tasks, expandedTaskDirs), [tasks, expandedTaskDirs]);

  const openTaskPicker = useCallback(() => {
    setTaskPickerIndex(firstSelectableIndex(visibleTasks));
    setTaskPickerOpen(true);
  }, [visibleTasks]);

  const pickTask = useCallback((path: string) => {
    const source = tasks.find((task) => task.path === path)?.source ?? 'project';
    const command = source === 'janissary'
      ? `execute $janissary/ai/tasks/${path}`
      : `execute ./ai/tasks/${path}`;
    insertIntoCommandLine(command, client, harnessPtyId, dropRef);
    setTaskPickerOpen(false);
  }, [tasks, client, harnessPtyId, dropRef]);

  const toggleTaskDir = useCallback((path: string) => {
    setExpandedTaskDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  return {
    taskPickerOpen, taskPickerIndex, setTaskPickerIndex, setTaskPickerOpen, openTaskPicker, pickTask,
    visibleTasks, toggleTaskDir,
  };
}
