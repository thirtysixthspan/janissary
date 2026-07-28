import type { Managers } from '../managers.js';
import type { ScreenCapture } from './screen.js';
import type { HarnessTranscriptTailer } from './transcript/tailer.js';
import { writeCaptureFile } from './capture-file.js';

// The `harness <subcommand> <label>` forms, which target an existing harness tab by label rather
// than launching a new one. Split out of `HarnessManager` so the manager keeps only the lifecycle
// wiring (spawning, observers, disposal) and these label-targeting bodies live together.

// Resolve a tab label to a harness tab, or return the error string to surface in the invoking tab's
// transcript. Shared by every subcommand below so their missing-label and wrong-tab-kind wording
// stays identical.
function resolveHarnessTab(managers: Managers, label: string): { error: string } | { ok: true } {
  const tab = managers.tab.tabs.find((t) => t.label === label);
  if (!tab) return { error: `No tab labeled "${label}".` };
  if (!tab.harness) return { error: `"${label}" is not a harness tab.` };
  return { ok: true };
}

// Handle `harness capture <name>`: write the target tab's latest in-memory screen capture to a
// file under .janissary/captures/ and open it in a normal editor tab. Returns an error message
// to surface in the invoking tab's transcript, or undefined on success.
export function captureSubcommand(
  managers: Managers,
  latestCapture: (label: string) => ScreenCapture | undefined,
  input: string,
  label: string,
): string | undefined {
  const resolved = resolveHarnessTab(managers, label);
  if ('error' in resolved) return resolved.error;
  const latest = latestCapture(label);
  if (!latest) return `No capture available for "${label}" yet.`;
  const file = writeCaptureFile(label, latest.capturedAt, latest.text);
  managers.openFile.edit(input, file, managers.tab.cur().label);
  return undefined;
}

// Handle `harness transcript <name>`: open the target tab's normalized session transcript — the
// history extracted from the harness's own dot directory, including any subagent activity — in a
// normal editor tab. A point-in-time open of the file as it stands, exactly like `harness capture`.
// A tab with no tailer (an ssh tab, or a harness whose session never resolved) has no transcript.
export function transcriptSubcommand(
  managers: Managers,
  tailerFor: (label: string) => HarnessTranscriptTailer | undefined,
  input: string,
  label: string,
): string | undefined {
  const resolved = resolveHarnessTab(managers, label);
  if ('error' in resolved) return resolved.error;
  const file = tailerFor(label)?.transcriptFile();
  if (!file) return `No transcript available for "${label}" yet.`;
  managers.openFile.edit(input, file, managers.tab.cur().label);
  return undefined;
}
