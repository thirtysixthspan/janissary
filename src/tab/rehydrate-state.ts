import type { AgentState } from '../agent/types.js';
import type { Tab } from './types.js';
import { tabRuntime } from './runtime.js';

// Fans each rehydrated state's cwd/context/commandQueue out to its per-label map (skipping
// fields the persisted record never set) and notifies the caller once per state.
export function applyRehydratedState(
  states: AgentState[],
  tabs: Tab[],
  onState: (state: AgentState) => void,
): void {
  for (const s of states) {
    const tab = tabs.find((candidate) => candidate.label === s.name);
    if (tab) {
      const runtime = tabRuntime(tab);
      runtime.cwd = s.cwd;
      runtime.context = s.context ?? [];
      runtime.queue = s.commandQueue ?? [];
    }
    onState(s);
  }
}
