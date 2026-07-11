import type { JanusClient } from './ws';

// Populate the command line with `text` (via the shared recall ref) without submitting it — or,
// on a harness tab (no command line), send it straight into that harness's PTY as terminal input.
// Shared by the "populate, don't submit" pickers (tasks, profiles).
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
