import type { AgentState } from '../agent/types.js';
import type { Tab } from './types.js';
import type { AgentStatePersistence } from './persistence.js';

// The one decision every write into the state directory passes through, lifted out of `TabManager`
// to keep it under the file-size limit — see `ai/guidelines/code-guidelines.md`.
//
// A closed tab is refused: teardown removed its file, and a write arriving afterwards would put it
// back. Two can — `ShellManager.run`'s update closure persists the `tab` object it captured at
// dispatch, and `ScheduleManager.tick` persists per tab on its one-second loop.
//
// The refusal is lifted here rather than at tab creation because a closed tab's name returns to the
// pool and can be handed to a new tab. Checking the live list at the single write path covers every
// route a tab can be created by, and cannot leave a stale refusal behind.
//
// (`AgentStatePersistence.save` applies the separate remote-tab refusal, which is about a tab that
// should never have been persisted rather than one that no longer exists.)
export function persistAgentState(
  persistence: AgentStatePersistence, tabs: Tab[], state: AgentState,
): void {
  if (tabs.some((tab) => tab.label === state.name)) persistence.reopen(state.name);
  persistence.save(state);
}
