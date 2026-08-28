import { useMemo, useState } from 'react';
import type { ProfileRow } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { populateCommandLine } from '../populate-command-line';
import { firstProfileIndex, profilePickerRows } from './profile-picker-keys';

// State and handlers for the `profile launch` picker (mirrors the `hist` picker's shape) — unlike
// `hist`, selecting a profile populates the command line without submitting it, the same way the
// `queue`/`tasks` pickers do (including the harness-tab special case: on a harness tab there is
// no command line, so the text goes straight into that harness's PTY instead).
export function useProfilePicker(
  profiles: ProfileRow[],
  recallRef: React.RefObject<((text: string) => void) | null>,
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
  client: JanusClient,
  harnessPtyId: string | undefined,
) {
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);
  const [profilePickerIndex, setProfilePickerIndex] = useState(0);
  const visibleProfiles = useMemo(() => profilePickerRows(profiles), [profiles]);

  const openProfilePicker = () => {
    setProfilePickerIndex(firstProfileIndex(visibleProfiles));
    setProfilePickerOpen(true);
  };

  const pickProfile = (name: string) => {
    populateCommandLine(`profile launch ${name}`, client, harnessPtyId, recallRef, inputRef);
    setProfilePickerOpen(false);
  };

  return {
    profilePickerOpen, profilePickerIndex, setProfilePickerIndex, setProfilePickerOpen, openProfilePicker, pickProfile,
    visibleProfiles,
  };
}
