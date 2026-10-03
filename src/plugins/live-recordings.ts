import type { Managers } from '../managers.js';

// The recording files that open tabs are writing right now, as absolute paths. Asked by a plugin
// through the `isRecordingLive` capability, which exists because the file itself cannot answer it: a
// recording ends when its tab closes just as surely as when its process exits, and only the tab that
// is still there knows the difference.
//
// Walked from the tab list rather than from the recorder registry, so a tab with no recording — one
// that has produced no output yet, and so has no file — contributes nothing rather than an empty one.
export function liveRecordingPaths(managers: Managers): Set<string> {
  const live = new Set<string>();
  for (const tab of managers.tab.tabs) {
    if (!tab.harness) continue;
    const recording = managers.harness.recordingPathOf(tab.label);
    if (recording) live.add(recording);
  }
  return live;
}
