import type { MonitorSub } from './monitor-manager.js';
import type { Managers } from './managers.js';
import { writeCaptureFile } from './harness/capture-file.js';

// Record a piece of a monitor's ACP context (a priming block, an update prompt, an ask, or a
// reply): grow the running byte count and keep the text itself, so the full context can be
// snapshotted later. Called wherever `contextBytes` used to be incremented directly; cleared
// (alongside `contextBytes`) when the session respawns.
export function recordContext(reg: MonitorSub, text: string): void {
  reg.contextBytes += Buffer.byteLength(text, 'utf8');
  reg.contextText.push(text);
}

// Open a point-in-time snapshot of the external monitor feeding reporting tab `name` in an editor
// tab (scrollable like any editor tab). Reuses the capture-file + editor path, so the accumulated
// context text — priming, update prompts, asks, and replies — is written to a file and opened for
// reading. No live monitor or empty context is a no-op.
export function snapshotMonitorContext(monitors: Iterable<MonitorSub>, managers: Managers, name: string): void {
  const reg = [...monitors].find((r) => !r.inline && r.persona.name === name);
  if (!reg || reg.contextText.length === 0) return;
  const file = writeCaptureFile(name, Date.now(), reg.contextText.join('\n\n'));
  managers.openFile.edit(`monitor context ${name}`, file, managers.tab.cur().label);
}
