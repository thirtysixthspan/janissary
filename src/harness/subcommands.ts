import type { Managers } from '../managers.js';
import type { ScreenCapture } from './screen.js';
import type { HarnessTranscriptTailer } from './transcript/tailer.js';
import { writeCaptureFile } from './capture/file.js';
import { queryParkedCapture, type RemoteCaptureResult } from './capture/remote.js';

// The `harness <subcommand> <label>` forms, which target an existing harness tab by label rather
// than launching a new one. Split out of `HarnessManager` so the manager keeps only the lifecycle
// wiring (spawning, observers, disposal) and these label-targeting bodies live together.

// Resolve a tab label to a harness tab, or return the error string to surface in the invoking tab's
// transcript. Shared by every subcommand below so their missing-label and wrong-tab-kind wording
// stays identical.
function resolveHarnessTab(managers: Managers, label: string): { error: string } | { ok: true } {
  const tab = managers.tab.byLabel(label);
  if (!tab) return { error: `No tab labeled "${label}".` };
  if (!tab.harness) return { error: `"${label}" is not a harness tab.` };
  return { ok: true };
}

// Write a resolved capture (or its absence) to the invoking tab: a file opened in a normal editor
// tab on success, an appended error line on failure — the same two outcomes the local, synchronous
// path already has, reported the same way once an async round trip settles instead of immediately.
function reportCaptureResult(
  managers: Managers, input: string, label: string, invokingLabel: string, capture: RemoteCaptureResult,
): void {
  if (capture && 'error' in capture) {
    managers.tab.append(invokingLabel, { input: '', output: `Detached capture query failed: ${capture.error}` });
    return;
  }
  if (!capture) {
    managers.tab.append(invokingLabel, { input: '', output: `No capture available for "${label}" yet.` });
    return;
  }
  const file = writeCaptureFile(label, capture.capturedAt, capture.text);
  managers.openFile.edit(input, file, invokingLabel);
}

// A remote tab that is still open: attached, round-trip the live channel's on-demand capture-request
// (decision 15 of the auto-accept-while-detached plan); reconnecting, fail immediately rather than
// queue behind the retry — consistent with Attach on a reconnecting Sessions row already meaning
// "try now" rather than "wait for it".
function resolveOpenRemoteCapture(managers: Managers, input: string, label: string, id: string): string | undefined {
  if (managers.remote.reconnectingOf(label)) return `No capture available for "${label}" — connection is reconnecting.`;
  const channel = managers.remote.get(label);
  if (!channel) return `No capture available for "${label}" — connection is reconnecting.`;
  if (!channel.sessionId) return `No capture available for "${label}" — connection is reconnecting.`;
  const invokingLabel = managers.tab.cur().label;
  void channel.requestCapture(id, channel.sessionId).then((capture) => {
    reportCaptureResult(managers, input, label, invokingLabel, capture);
  });
  return undefined;
}

// No open tab named `label` at all: after a deliberate Detach every tab for that session is already
// closed, so `<name>` is resolved against the persisted `RemoteSessionRecord.processes[].label`
// instead (decision 15) — the same record the Sessions tab's detached rows already read — and the
// query travels over the new one-off, non-attaching connection to the parked peer (decision 16).
// A `<name>` matching no open tab and no persisted process keeps today's "No tab labeled" error.
function resolveDetachedCapture(managers: Managers, input: string, label: string): string | undefined {
  const match = managers.sessions?.recordForProcess(label);
  if (!match) return `No tab labeled "${label}".`;
  if (match === 'ambiguous') return `Multiple detached sessions are labeled "${label}". Attach the intended session before capturing.`;
  const invokingLabel = managers.tab.cur().label;
  void queryParkedCapture(managers, match.record, match.process.id).then((capture) => {
    reportCaptureResult(managers, input, label, invokingLabel, capture);
  });
  return undefined;
}

// Handle `harness capture <name>`: local resolution is unchanged (the target tab's latest in-memory
// screen capture, written to a file under .janissary/captures/ and opened in a normal editor tab,
// synchronously); a remote target resolves differently depending on whether a local tab still exists
// for it — see `resolveOpenRemoteCapture`/`resolveDetachedCapture`. Returns an error message to
// surface in the invoking tab's transcript, or undefined once the capture is already open or is on
// its way (an async path reports its own outcome when it settles, via `reportCaptureResult`).
export function captureSubcommand(
  managers: Managers,
  latestCapture: (label: string) => ScreenCapture | undefined,
  input: string,
  label: string,
): string | undefined {
  const tab = managers.tab.byLabel(label);
  if (!tab) return resolveDetachedCapture(managers, input, label);
  if (!tab.harness) return `"${label}" is not a harness tab.`;
  if (!tab.remote) {
    const latest = latestCapture(label);
    if (!latest) return `No capture available for "${label}" yet.`;
    const file = writeCaptureFile(label, latest.capturedAt, latest.text);
    managers.openFile.edit(input, file, managers.tab.cur().label);
    return undefined;
  }
  return resolveOpenRemoteCapture(managers, input, label, tab.harness.ptyId);
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
