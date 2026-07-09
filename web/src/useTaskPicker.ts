import { useCallback, useState } from 'react';

// State and handlers for the Ctrl+A / `tasks` picker. Mirrors the queue picker's
// populate-not-submit shape (not `hist`'s run-immediately shape): selecting a task writes
// `execute ./ai/<file>` into the command line via the shared recall ref and closes the popup, so
// the user can supplement or edit the command before running it themselves.
export function useTaskPicker(
  tasks: string[],
  recallRef: React.RefObject<((text: string) => void) | null>,
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
) {
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [taskPickerIndex, setTaskPickerIndex] = useState(0);

  const openTaskPicker = useCallback(() => {
    setTaskPickerIndex(0);
    setTaskPickerOpen(true);
  }, []);

  const pickTask = useCallback((name: string) => {
    recallRef.current?.(`execute ./ai/${name}`);
    setTaskPickerOpen(false);
    inputRef.current?.focus();
  }, [recallRef, inputRef]);

  return { taskPickerOpen, taskPickerIndex, setTaskPickerIndex, setTaskPickerOpen, openTaskPicker, pickTask };
}
