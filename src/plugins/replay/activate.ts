import path from 'node:path';
import { defineIntents, type TabPluginActivation } from '../api.js';
import { fileTabPayload, servesContentType } from '../files.js';
import { replayManifest } from './manifest.js';
import { isReplayPayload } from './shared.js';

// The timestamp `harnessArtifactFilename` appends to every per-tab artifact, in the shape it writes
// it: an ISO instant with `:` and `.` replaced by `-`. Stripped off the end of a recording's stem to
// recover the label the artifact was named for, so the tab reads `replay: devbox` whether the user
// typed that label or the file's path. A name that carries no such stamp keeps its whole stem.
const RECORDING_STAMP = /-\d{4}-\d{2}-\d{2}T[\d-]+Z$/u;

export function replayLabelFromFilename(file: string): string {
  const stem = path.basename(file).replace(/\.cast$/iu, '');
  return stem.replace(RECORDING_STAMP, '') || stem;
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isReplayPayload,
    // No intents, and none needed: the recording is served to the client as a file and played there,
    // so playback position, speed, and the idle limit are all view-local state the host never has to
    // hold. An empty table rejects an unknown intent name, which is the whole contract here.
    intent: defineIntents('replay', isReplayPayload, {}),
    opener: {
      inline: (file, capabilities) => {
        if (!servesContentType(replayManifest, file)) {
          return capabilities.rejectRequest('Not a terminal recording.');
        }
        capabilities.openOrFocusTab(file, (resources) => ({
          title: `replay: ${replayLabelFromFilename(file)}`,
          // The file cannot say whether its session is still running — a recording ended by closing
          // the tab carries no exit event — so the host is asked. A false answer is the same as no
          // answer: nothing is appending to that file, so it is finished.
          payload: {
            ...fileTabPayload(file, resources),
            finished: !capabilities.isRecordingLive(file),
          },
        }));
      },
      // A recording is a timed byte stream, and no application outside this one can seek one, so
      // there is nothing to hand to an OS opener. The claim maps `.cast` to a content type, so the
      // open pipeline never routes a file here as external in the first place; the rejection is what
      // an explicit "open externally" would answer with.
      external: (_file, capabilities) => {
        capabilities.rejectRequest('A terminal recording has no external viewer.');
      },
    },
  };
}
