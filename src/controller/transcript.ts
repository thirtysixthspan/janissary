import type { Managers } from '../managers.js';
import type { AcpRef } from '../protocol.js';
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

// Open the ACP session identified by `acpRef` as a point-in-time transcript snapshot in an editor
// tab — the clipboard button on a connections-panel ACP row (see acp-connection-row-transcript-
// button). Unlike `openTranscriptFor`, an empty exchange still opens a tab, reading the literal
// placeholder `No transcript yet.`, so every click gives visible feedback.
export function openAcpTranscript(managers: Managers, acpRef: AcpRef): void {
  let text: string;
  let name: string;
  if (acpRef.scope === 'tab') {
    name = `acp:${acpRef.label}`;
    text = transcriptText(managers.tab.tabs.find((t) => t.label === acpRef.label)?.log ?? []);
  } else if (acpRef.scope === 'monitor') {
    name = `monitor:${acpRef.name}`;
    text = managers.monitor.transcript(acpRef.name);
  } else {
    name = acpRef.persona;
    text = managers.editorAcp.transcript(acpRef.label, acpRef.persona);
  }
  const file = writeCaptureFile(name, Date.now(), text.length === 0 ? 'No transcript yet.' : text);
  managers.openFile.edit(`transcript ${name}`, file, managers.tab.cur().label);
}
