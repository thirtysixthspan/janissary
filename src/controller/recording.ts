import type { Managers } from '../managers.js';
import path from 'node:path';
import { playablePluginForExtension } from '../openers/index.js';

// Open the named tab's session recording in the tab that plays it — the recording flag in a
// metadata row (see web/src/shared/AgentTabMeta.tsx and the shell plugin's own row).
//
// Routed through the same guarded path `open` uses, rather than by naming the asciicast plugin here,
// so activation, the plugin deadline, and the failure boundary are not restated in a second place:
// the extension decides which plugin owns the file, and that plugin's own opener decides whether the
// recording is finished. A file whose type nothing claims playable is simply not opened — which is
// what makes the flag's disabled state a real one rather than a click that fails.
//
// Silently no-ops like its sibling `openHarnessTranscriptFor`: a button in a row has no transcript
// to answer a refusal into, and the tab it would have named has no recording to show.
export function openRecordingFor(managers: Managers, label: string): void {
  const file = managers.harness.recordingPathOf(label);
  if (!file) return;
  const plugin = playablePluginForExtension(path.extname(file));
  if (plugin === undefined) return;
  void managers.plugins.runOpener(plugin, 'inline', file, { label, command: file });
}