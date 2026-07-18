import type { TaskRow } from '@shared/protocol';
import type { JanusClient } from './ws';
import type { CommandInputDropHandle } from './CommandInput';
import { useTaskPicker } from './useTaskPicker';
import { useProfilePicker } from './useProfilePicker';

// Bundles the "don't submit" pickers into one hook call. The task picker inserts at the command
// line's cursor (via the drop handle); the profile picker overwrites the whole line (via the recall
// ref). Split out of App.tsx to keep it under the file-size limit.
export function usePopulatePickers(
  tasks: TaskRow[],
  janissaryTasksDir: string,
  recallRef: React.RefObject<((text: string) => void) | null>,
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
  client: JanusClient,
  harnessPtyId: string | undefined,
  dropRef: React.RefObject<CommandInputDropHandle | null>,
) {
  const task = useTaskPicker(tasks, janissaryTasksDir, client, harnessPtyId, dropRef);
  const profile = useProfilePicker(recallRef, inputRef, client, harnessPtyId);
  return { ...task, ...profile };
}
