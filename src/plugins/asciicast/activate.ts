import path from 'node:path';
import { defineIntents, type TabPluginActivation } from '../api.js';
import { fileTabPayload, servesContentType } from '../files.js';
import { asciicastManifest } from './manifest.js';
import { isAsciicastPayload, type AsciicastPayload } from './shared.js';

// The timestamp `harnessArtifactFilename` appends to every per-tab artifact, in the shape it writes
// it: an ISO instant with `:` and `.` replaced by `-`. Stripped off the end of a recording's stem to
// recover the label the artifact was named for, so the tab reads `asciicast: devbox` whether the user
// typed that label or the file's path. A name that carries no such stamp keeps its whole stem.
const RECORDING_STAMP = /-\d{4}-\d{2}-\d{2}T[\d-]+Z$/u;

// The one intent this plugin has takes no argument: what it answers is a property of the tab's own
// recording, so there is nothing for a client to send. `null` rather than `{}` because the answer must
// not be mistaken for input the plugin might later start reading.
const takesNoArgument = (value: unknown): value is null => value === null;

export function asciicastLabelFromFilename(file: string): string {
  const stem = path.basename(file).replace(/\.cast$/iu, '');
  return stem.replace(RECORDING_STAMP, '') || stem;
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isAsciicastPayload,
    // One question, and it takes no argument: the tab's own payload already names the recording.
    intent: defineIntents('asciicast', isAsciicastPayload, {
      // Whether a live tab is still writing this recording. The file cannot answer it — a poll that
      // finds no new bytes is a session waiting on its next prompt just as much as a session that has
      // ended — so the player asks the host, which is the only thing that knows which recorders are
      // still open. The manifest already declares the capability this reaches for.
      liveness: {
        payload: takesNoArgument,
        run: (tabPayload: AsciicastPayload, _argument: null, capabilities) => ({
          live: capabilities.isRecordingLive(tabPayload.path),
        }),
      },
    }),
    opener: {
      inline: (file, capabilities) => {
        if (!servesContentType(asciicastManifest, file)) {
          return capabilities.rejectRequest('Not a terminal recording.');
        }
        capabilities.openOrFocusTab(file, (resources) => ({
          title: `asciicast: ${asciicastLabelFromFilename(file)}`,
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