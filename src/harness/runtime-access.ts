import type { Managers } from '../managers.js';
import type { HarnessRuntimes } from './runtime-registry.js';
import type { HarnessTranscriptTailer } from './transcript/tailer.js';
import type { ScreenCapture } from './screen.js';

// The three questions a caller asks about one tab's PTY runtime, asked by tab label. Split out of
// `HarnessManager` for the same reason `observers.ts` was: the manager owns the runtime registry,
// and these are lookups into it that hold no state of their own.
//
// Every one of them answers "nothing" for the same two reasons, and both are load-bearing rather
// than incidental. The tab may be missing or may not be a harness tab at all — an ssh tab reuses
// the harness-view shape but runs no harness binary, and a shell tab is not a harness tab at all.
// And a runtime is released on whichever comes first, its PTY exiting or its tab closing, so a
// lookup after the tab closed has nothing left to read.

export function screenTextOf(
  managers: Managers,
  runtimes: HarnessRuntimes,
  label: string,
): ScreenCapture | undefined {
  const tab = managers.tab.harnessTab(label);
  if (!tab) return undefined;
  return runtimes.get(tab.harness.ptyId)?.reader?.latestCapture();
}

// Only `finishSpawn` creates a tailer, so this is also what tells a real harness tab apart from an
// ssh tab — which carries the same harness-view shape and a `ptyId`, but has no session record to
// tail. Callers ask the tailer itself for entries or its file.
export function tailerOf(
  managers: Managers,
  runtimes: HarnessRuntimes,
  label: string,
): HarnessTranscriptTailer | undefined {
  const tab = managers.tab.harnessTab(label);
  if (!tab) return undefined;
  return runtimes.get(tab.harness.ptyId)?.tailer;
}

// The recording file the named tab wrote, remembered on the tab once its recorder opened one and
// kept there after the recorder is released. Absent for a tab that never produced output — which is
// why "no recording yet" and "no such tab" are different answers rather than one, and why a
// recording that ended with its process is still nameable.
export function recordingOf(managers: Managers, label: string): string | undefined {
  return managers.tab.tabs.find((tab) => tab.label === label)?.recording;
}

// The recording the named tab's PTY is writing *right now*, or nothing when it has exited, has
// never produced output, or never had a recorder at all. This is the one question a file cannot
// answer about itself: a recording ended by closing its tab carries no exit event, so only the tab
// that is still there knows the difference between a finished file and a paused one.
//
// Reached through the tab's own PTY rather than through the harness-view shape, because a shell tab
// records too and is not a harness tab — the same `ownsTerminal` rule `send`, `queue`, and
// `schedule` already share for deciding whether a plugin tab can be typed into.
export function liveRecordingOf(
  managers: Managers,
  runtimes: HarnessRuntimes,
  label: string,
): string | undefined {
  const tab = managers.tab.tabs.find((candidate) => candidate.label === label);
  if (!tab) return undefined;
  const id = tab.harness?.ptyId ?? managers.pty.terminalIdFor(label);
  if (id === undefined) return undefined;
  return runtimes.get(id)?.recorder?.recordingPath();
}