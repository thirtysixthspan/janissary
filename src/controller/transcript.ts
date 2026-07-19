import type { Managers } from '../managers.js';
import { writeCaptureFile } from '../harness/capture-file.js';
import { transcriptText } from '../tab/transcript-text.js';

// Open the named tab's full transcript as a plain-text snapshot in an editor tab — the
// clipboard metadata-row button (see AgentTabMeta.tsx).
export function openTranscriptFor(managers: Managers, label: string): void {
  const tab = managers.tab.tabs.find((t) => t.label === label);
  if (!tab || tab.log.length === 0) return;
  const file = writeCaptureFile(label, Date.now(), transcriptText(tab.log));
  managers.openFile.edit(`transcript ${label}`, file, label);
}
