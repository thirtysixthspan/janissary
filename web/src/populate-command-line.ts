import type { JanusClient } from './ws';
import type { CommandInputDropHandle } from './CommandInput';

// Populate the command line with `text` (via the shared recall ref) without submitting it — or,
// on a harness tab (no command line), send it straight into that harness's PTY as terminal input.
// Used by the profile picker (a whole-line "populate, don't submit" replace).
export function populateCommandLine(
  text: string,
  client: JanusClient,
  harnessPtyId: string | undefined,
  recallRef: React.RefObject<((text: string) => void) | null>,
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
): void {
  if (harnessPtyId) {
    client.send({ method: 'ptyInput', params: { id: harnessPtyId, data: text } });
  } else {
    recallRef.current?.(text);
    inputRef.current?.focus();
  }
}

// Insert `text` at the command line's current cursor (via the shared drop handle's `insertAtCaret`),
// leaving the surrounding text intact — or, on a harness tab (no command line), send it straight
// into that harness's PTY as terminal input. Used by the task picker.
export function insertIntoCommandLine(
  text: string,
  client: JanusClient,
  harnessPtyId: string | undefined,
  dropRef: React.RefObject<CommandInputDropHandle | null>,
): void {
  if (harnessPtyId) {
    client.send({ method: 'ptyInput', params: { id: harnessPtyId, data: text } });
  } else {
    dropRef.current?.insertAtCaret(text);
  }
}
