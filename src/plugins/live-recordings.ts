import type { Managers } from '../managers.js';

// The recording files that open tabs are writing right now, as absolute paths. Asked by a plugin
// through the `isRecordingLive` capability, which exists because the file itself cannot answer it: a
// recording ends when its tab closes just as surely as when its process exits, and only the tab that
// is still there knows the difference.
//
// Every tab kind that records is asked, not just the harness-view ones: a shell tab records too, and
// an asciicast player opened on a live shell recording has to be told it is live rather than shown a
// finished file that is still growing.
//
// Walked from the tab list rather than from the recorder registry, so a tab with no recording — one
// that has produced no output yet, and so has no file — contributes nothing rather than an empty one.
export function liveRecordingPaths(managers: Managers): Set<string> {
  const live = new Set<string>();
  for (const tab of managers.tab.tabs) {
    const recording = managers.harness.liveRecordingPathOf(tab.label);
    if (recording) live.add(recording);
  }
  return live;
}