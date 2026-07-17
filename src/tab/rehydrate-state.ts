import type { AgentState } from '../types.js';

// Fans each rehydrated state's cwd/context/commandQueue out to its per-label map (skipping
// fields the persisted record never set) and notifies the caller once per state.
export function applyRehydratedState(
  states: AgentState[],
  cwd: Map<string, string>,
  context: Map<string, string[]>,
  queue: Map<string, string[]>,
  onState: (state: AgentState) => void,
): void {
  for (const s of states) {
    if (s.cwd) cwd.set(s.name, s.cwd);
    if (s.context) context.set(s.name, s.context);
    if (s.commandQueue) queue.set(s.name, s.commandQueue);
    onState(s);
  }
}
