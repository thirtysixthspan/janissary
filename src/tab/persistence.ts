import type { AgentState } from '../agent/types.js';
import { saveAgentState } from '../agent/state.js';
import { errorText } from '../error-text.js';

export class AgentStatePersistence {
  private failed = new Set<string>();
  private closed = new Set<string>();

  // A closed tab's state file has been removed; refuse to write it back. Two paths can arrive after
  // the close: `ShellManager.run`'s update closure persists the `tab` object it captured at dispatch,
  // so a command finishing afterwards would recreate the file, and `ScheduleManager.tick` persists
  // per tab on its one-second loop.
  forget(name: string): void {
    this.closed.add(name);
    this.failed.delete(name);
  }

  // Lift the refusal. A closed tab's name goes back into the pool and can be handed to a new tab, so
  // the mark cannot be permanent — see `TabManager.persist`, which lifts it whenever a tab is
  // actually open under that label.
  reopen(name: string): void {
    this.closed.delete(name);
  }

  save(state: AgentState): void {
    if (state.remote !== undefined || this.closed.has(state.name)) return;
    try {
      saveAgentState(state);
      this.failed.delete(state.name);
    } catch (error) {
      if (this.failed.has(state.name)) return;
      this.failed.add(state.name);
      const message = errorText(error);
      process.stderr.write(`warning: failed to persist agent state for ${state.name}: ${message}\n`);
    }
  }
}
