import type { AgentState } from '../../agent/types.js';
import { getConfig } from '../../config.js';
import { TabOpeningState } from '../opening-state.js';
import { capLog } from './log.js';
import * as transcriptOperations from './operations.js';
import type { LogEntry, Tab } from '../types.js';

// A tab's transcript: the log it has written and the still-running entry at the tail of it. Every
// method here is `TabManager`'s own wiring of `transcript-operations` to tab state — the cap the
// configured maximum applies, and the persistence and unread-marking each operation has to reach
// — so it lives here rather than in the manager, which is then only tab state and tab selection.
export abstract class TabTranscriptState extends TabOpeningState {
  abstract secondaryTabLabel?: string;

  abstract persist(state: AgentState): void;

  abstract buildAgentState(tab: Tab, extra?: Partial<AgentState>): AgentState;

  abstract deleteBusy(label: string): void;

  abstract markUnread(label: string): void;

  startRunning(label: string, input: string, fields?: transcriptOperations.RunningEntryFields): void {
    transcriptOperations.startRunning(this.tabs, label, input, (l, entry) => this.append(l, entry), fields);
  }

  finishRunning(label: string, output: string, match?: transcriptOperations.RunningEntryMatch): void {
    transcriptOperations.finishRunning(this.tabs, label, output, (l) => this.deleteBusy(l), (s) => this.persist(s), (t) => this.buildAgentState(t), (l) => this.markUnread(l), match);
  }

  updateRunning(label: string, match: transcriptOperations.RunningEntryMatch | undefined, output: string, running: boolean, hooks: transcriptOperations.UpdateRunningHooks = {}): void {
    transcriptOperations.updateRunning(this.tabs, label, match, output, running, hooks);
  }

  protected capToConfiguredMax(log: LogEntry[]): LogEntry[] {
    return transcriptOperations.capToConfiguredMax(log, getConfig().transcriptMaxLines);
  }

  append(label: string, entry: LogEntry, maxLines?: number): void {
    transcriptOperations.append(
      this.tabs, label, entry, (log) => maxLines === undefined ? this.capToConfiguredMax(log) : capLog(log, maxLines),
      this.tabs[this.activeTab]?.label, this.secondaryTabLabel,
    );
  }

  clearTranscript(label: string): void {
    transcriptOperations.clearTranscript(
      this.tabs, label, (s) => this.persist(s), (t) => this.buildAgentState(t),
    );
  }

  recordHistory(index: number, text: string): string {
    return transcriptOperations.recordHistoryForTab(this.tabs[index], text);
  }
}
