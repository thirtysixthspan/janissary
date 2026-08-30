import type { AgentState } from '../agent/types.js';
import { saveAgentState } from '../agent/state.js';
import { errorText } from '../error-text.js';

export class AgentStatePersistence {
  private failed = new Set<string>();

  save(state: AgentState): void {
    if (state.remote !== undefined) return;
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
