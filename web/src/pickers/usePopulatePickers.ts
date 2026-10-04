import type { ProfileRow, TaskRow } from '@shared/protocol';
import type { JanusClient } from '../ws';
import type { CommandInputDropHandle } from '../shared/drop-handles';
import type { PluginCommandLineInsertions } from '../shared/command-bar/AppCommandBar';
import { useTaskPicker } from './useTaskPicker';
import { useProfilePicker } from './useProfilePicker';

// Bundles the "don't submit" pickers into one hook call. The task picker inserts at the command
// line's cursor (via the drop handle); the profile picker overwrites the whole line (via the recall
// ref). Split out of App.tsx to keep it under the file-size limit.
export function usePopulatePickers(
  tasks: TaskRow[],
  profiles: ProfileRow[],
  recallRef: React.RefObject<((text: string) => void) | null>,
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
  client: JanusClient,
  harnessPtyId: string | undefined,
  dropRef: React.RefObject<CommandInputDropHandle | null>,
  focusHarness: (ptyId: string) => void,
  pluginCommandLineInsertions: PluginCommandLineInsertions,
  shellLabel: string | undefined,
) {
  const task = useTaskPicker(
    tasks, client, harnessPtyId, dropRef, focusHarness, pluginCommandLineInsertions, shellLabel,
  );
  const profile = useProfilePicker(profiles, recallRef, inputRef, client, harnessPtyId);
  return { ...task, ...profile };
}
