import type { MonitorSub } from './manager.js';
import type { Managers } from '../managers.js';
import { writeCaptureFile } from '../harness/capture-file.js';

// One block of a monitor's ACP context, tagged with its direction: `input` is text fed to the
// model (persona priming, a batched update prompt, or an ask), `response` is a model reply. The
// tag lets a snapshot delineate what was sent from what was received.
export type MonitorContextEntry = { role: 'input' | 'response'; text: string };

const HEADERS: Record<MonitorContextEntry['role'], { begin: string; end: string }> = {
  input: { begin: '━━━━━━━━━━ SENT TO MODEL BEGIN ━━━━━━━━━━', end: '━━━━━━━━━━ SENT TO MODEL END ━━━━━━━━━━' },
  response: { begin: '━━━━━━━━━━ MODEL RESPONSE BEGIN ━━━━━━━━━━', end: '━━━━━━━━━━ MODEL RESPONSE END ━━━━━━━━━━' },
};

// Record a piece of a monitor's ACP context (a priming block, an update prompt, an ask, or a
// reply): grow the running byte count and keep the text tagged with its direction, so the full
// context can be snapshotted later with inputs and responses clearly separated. Called wherever
// `contextBytes` used to be incremented directly; cleared (alongside `contextBytes`) when the
// session respawns.
export function recordContext(reg: MonitorSub, text: string, role: MonitorContextEntry['role']): void {
  reg.contextBytes += Buffer.byteLength(text, 'utf8');
  reg.contextText.push({ role, text });
}

// Open a point-in-time snapshot of the external monitor feeding reporting tab `name` in an editor
// tab (scrollable like any editor tab). Reuses the capture-file + editor path, so the accumulated
// context text — priming, update prompts, asks, and replies — is written to a file with each block
// under a header marking whether it was sent to or received from the model, then opened for
// reading. No live monitor or empty context is a no-op.
export function snapshotMonitorContext(monitors: Iterable<MonitorSub>, managers: Managers, name: string): void {
  const reg = [...monitors].find((r) => !r.inline && r.name === name);
  if (!reg || reg.contextText.length === 0) return;
  const body = reg.contextText.map(({ role, text }) => `${HEADERS[role].begin}\n${text}\n${HEADERS[role].end}`).join('\n\n');
  const file = writeCaptureFile(name, Date.now(), body);
  managers.openFile.edit(`monitor context ${name}`, file, managers.tab.cur().label);
}
