import type { JanusClient } from '../shared/ws/ws';
import type { CommandInputDropHandle } from '../shared/drop-handles';
import type { PluginCommandLineReplacements } from '../shared/command-bar/AppCommandBar';

// Replace the recorded owner's whole command draft without submitting it — or, on a harness tab
// (no command line), send it straight into that harness's PTY as terminal input. A missing owner
// registration is a no-op; selection never redirects into whichever tab happens to be current.
export function populateCommandLine(
  text: string,
  client: JanusClient,
  harnessPtyId: string | undefined,
  ownerLabel: string | undefined,
  replacements: PluginCommandLineReplacements,
): void {
  if (harnessPtyId) {
    client.send({ method: 'ptyInput', params: { id: harnessPtyId, data: text } });
  } else if (ownerLabel !== undefined) replacements.current.get(ownerLabel)?.(text);
}

// Insert `text` at the command line's current cursor (via the shared drop handle's `insertAtCaret`),
// leaving the surrounding text intact — or, on a harness tab (no command line), send it straight
// into that harness's PTY as terminal input and put the keyboard back on that harness's terminal,
// since a row click has already taken it away. Used by the task picker.
export function insertIntoCommandLine(
  text: string,
  client: JanusClient,
  harnessPtyId: string | undefined,
  dropRef: React.RefObject<CommandInputDropHandle | null>,
  focusHarness: (ptyId: string) => void,
): void {
  if (harnessPtyId) {
    client.send({ method: 'ptyInput', params: { id: harnessPtyId, data: text } });
    focusHarness(harnessPtyId);
  } else {
    dropRef.current?.insertAtCaret(text);
  }
}
