import { statSync } from 'node:fs';

// The narrow slice of a files-tab's state this module touches — just its poll timer, so this
// stays decoupled from FileNavigatorManager's full FilesTabState (mirrors watch.ts's WatchableState).
type PollableState = { pollTimer?: ReturnType<typeof setInterval> };

const POLL_INTERVAL_MS = 500;

// Polls `absDir` every `POLL_INTERVAL_MS` until it exists as a directory, then calls `onReady` and
// stops. A no-op if the tab is unknown or already polling. Filesystem races (permission denied,
// removed mid-check) are swallowed — polling just keeps trying on the next tick.
export function pollForDir(states: Map<string, PollableState>, label: string, absDir: string, onReady: () => void): void {
  const state = states.get(label);
  if (!state || state.pollTimer) return;
  state.pollTimer = setInterval(() => {
    let stat;
    try { stat = statSync(absDir); } catch { stat = undefined; }
    if (!stat?.isDirectory()) return;
    stopPolling(state);
    onReady();
  }, POLL_INTERVAL_MS);
}

// Stops and forgets an in-flight poll timer, if any.
export function stopPolling(state: PollableState): void {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = undefined;
}
