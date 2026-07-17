import type { TaskRow } from '@shared/protocol';
import type { JanusClient } from './ws';
import { useTaskPicker } from './useTaskPicker';
import { useProfilePicker } from './useProfilePicker';

// Bundles the "populate, don't submit" pickers (tasks, profiles) into one hook call — both share
// the same `(recallRef, inputRef, client, harnessPtyId)` shape, unlike `hist`'s run-immediately
// shape (`useHistPicker`). Split out of App.tsx to keep it under the file-size limit.
export function usePopulatePickers(
  tasks: TaskRow[],
  janissaryTasksDir: string,
  recallRef: React.RefObject<((text: string) => void) | null>,
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
  client: JanusClient,
  harnessPtyId: string | undefined,
) {
  const task = useTaskPicker(tasks, janissaryTasksDir, recallRef, inputRef, client, harnessPtyId);
  const profile = useProfilePicker(recallRef, inputRef, client, harnessPtyId);
  return { ...task, ...profile };
}
