import { useState } from 'react';
import type { JanusClient } from './ws';
import { populateCommandLine } from './populate-command-line';

// State and handlers for the `profile launch` picker (mirrors the `hist` picker's shape) — unlike
// `hist`, selecting a profile populates the command line without submitting it, the same way the
// `queue`/`tasks` pickers do (including the harness-tab special case: on a harness tab there is
// no command line, so the text goes straight into that harness's PTY instead).
export function useProfilePicker(
  recallRef: React.RefObject<((text: string) => void) | null>,
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
  client: JanusClient,
  harnessPtyId: string | undefined,
) {
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);
  const [profilePickerIndex, setProfilePickerIndex] = useState(0);

  const openProfilePicker = () => {
    setProfilePickerIndex(0);
    setProfilePickerOpen(true);
  };

  const pickProfile = (name: string) => {
    populateCommandLine(`profile launch ${name}`, client, harnessPtyId, recallRef, inputRef);
    setProfilePickerOpen(false);
  };

  return {
    profilePickerOpen, profilePickerIndex, setProfilePickerIndex, setProfilePickerOpen, openProfilePicker, pickProfile,
  };
}
