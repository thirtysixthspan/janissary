import type { ShellHistoryRun } from '../remote/protocol.js';
import type { LogEntry } from '../tab/types.js';
import { COMMAND_INPUT_PREFIX, COMMAND_INPUT_SUFFIX, PWD_QUERY_PREFIX } from './command-input.js';
import { stripShellSentinels } from './sentinel-strip.js';

// Rebuilding an attached agent tab's transcript from a detached peer's retained history.
//
// A remote agent tab's shell runs in `pipe` mode, so nothing it was sent was ever echoed back: the
// peer retains the two directions separately and replays them as ordered runs. Each command run opens
// a transcript entry; the output runs that follow it are that entry's output, exactly as the live tab
// recorded them. Pure, so the segmentation is testable without a channel, a tab, or a shell.

// The command inside the wrapper `shellCommandInput` writes. Anything else written to a piped shell
// is taken at face value rather than guessed at — a tab shows what was sent, not an interpretation of
// it.
function commandOf(text: string): string {
  if (!text.startsWith(COMMAND_INPUT_PREFIX)) return text.trimEnd();
  const end = text.lastIndexOf(COMMAND_INPUT_SUFFIX);
  if (end === -1) return text.trimEnd();
  return text.slice(COMMAND_INPUT_PREFIX.length, end);
}

// Live execution slices its buffer at the sentinel, so the sentinel lines never reach a live
// transcript; restored output is the raw stream and still carries them. Removing them here is what
// makes restored history read the way live output always has.
function finish(entries: LogEntry[], pending: LogEntry): void {
  const output = stripShellSentinels(pending.output).trim();
  if (!pending.input && !output) return;
  entries.push({ input: pending.input, output });
}

/**
 * The transcript entries a peer's retained runs describe, in order.
 *
 * Output with no command ahead of it becomes a leading entry with no input: the history is bounded, so
 * the oldest command may have been trimmed away from the output it produced. A trailing pwd query is
 * skipped — it is bookkeeping the user never typed, and the debris it leaves in the stream is what
 * `stripShellSentinels` already removes.
 */
export function restoredTranscript(runs: readonly ShellHistoryRun[]): LogEntry[] {
  const entries: LogEntry[] = [];
  let pending: LogEntry = { input: '', output: '' };
  for (const run of runs) {
    if (run.source === 'output') { pending.output += run.text; continue; }
    if (run.text.startsWith(PWD_QUERY_PREFIX)) continue;
    finish(entries, pending);
    pending = { input: commandOf(run.text), output: '' };
  }
  finish(entries, pending);
  return entries;
}
