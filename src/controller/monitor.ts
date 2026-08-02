import type { Managers } from '../managers.js';
import { runSuggestion as runMonitorSuggestion } from '../monitor/window.js';

// The monitor reporting tab's RPC surface, extracted from `controller.ts` to keep it under the
// file-size guideline — the same shape as `controller/file-navigator.ts`: plain functions taking
// `Managers`, with the controller reduced to one-line delegation.

// Run a monitor suggestion's command in the tab the suggestion is about; it stays in the feed.
export function runSuggestion(managers: Managers, id: string): void {
  runMonitorSuggestion(managers, id);
}

// Rate a suggestion 👍/👎 and remove it from the feed (either direction).
export function rateSuggestion(managers: Managers, id: string, up: boolean): void {
  managers.monitor.rate(id, up);
}

// Reset a monitor's reporting tab to just its persona context.
export function resetMonitorContext(managers: Managers, name: string): void {
  managers.monitor.resetContext(name);
}

// Open a point-in-time snapshot of a monitor's accumulated ACP context in an editor tab.
export function monitorContextSnapshot(managers: Managers, name: string): void {
  managers.monitor.snapshotContext(name);
}
