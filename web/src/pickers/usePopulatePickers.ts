import type { ProfileRow, TaskRow } from '@shared/protocol';
import type { JanusClient } from '../shared/ws/ws';
import type { CommandInputDropHandle } from '../shared/drop-handles';
import type { PluginCommandLineInsertions, PluginCommandLineReplacements } from '../shared/command-bar/AppCommandBar';
import { useTaskPicker } from './useTaskPicker';
import { useProfilePicker } from './useProfilePicker';

// Bundles the "don't submit" pickers into one hook call. The task picker inserts at the command
// line's cursor (via the drop handle); the profile picker overwrites the whole line (via the recall
// ref). Split out of App.tsx to keep it under the file-size limit.
export function usePopulatePickers(
  tasks: TaskRow[],
  profiles: ProfileRow[],
  client: JanusClient,
  harnessPtyId: string | undefined,
  dropRef: React.RefObject<CommandInputDropHandle | null>,
  focusHarness: (ptyId: string) => void,
  pluginCommandLineInsertions: PluginCommandLineInsertions,
  profileOwnerLabel: string | undefined,
  profileHarnessPtyId: string | undefined,
  profileReplacements: PluginCommandLineReplacements,
  shellLabel: string | undefined,
) {
  const task = useTaskPicker(
    tasks, client, harnessPtyId, dropRef, focusHarness, pluginCommandLineInsertions, shellLabel,
  );
  const profile = useProfilePicker(profiles, profileOwnerLabel, profileReplacements, client, profileHarnessPtyId);
  return { ...task, ...profile };
}
