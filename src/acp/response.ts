import type { Managers } from '../managers.js';
import type { LogEntry, Tab } from '../tab/types.js';
import type { AcpPromptResult } from './types.js';
import { flattenBuffer } from '../tab/formatting.js';
import { messageBus } from '../bus.js';

export function appendAcp(managers: Managers, label: string, entry: LogEntry): void {
  const tab = managers.tab.byLabel(label);
  if (tab) {
    tab.runtime ??= { busy: false, context: [], queue: [] };
    tab.runtime.acpEntries ??= new WeakSet();
    tab.runtime.acpEntries.add(entry);
  }
  managers.tab.append(label, entry);
}

export function acpResponseFor(tab: Tab) {
  const entries = tab.runtime?.acpEntries;
  if (tab.view !== 'plugin' || !entries) return;
  return {
    lines: flattenBuffer(tab.log.filter((entry) => entries.has(entry)), !tab.toolStepsExpanded),
    running: tab.runtime?.acpPrompt !== undefined,
  };
}

// Settle the prompt a tab is running with the result it produced, whether the tool loop finished, the
// loop failed, or a reset closed the session underneath it. The caller hears which, because a refusal
// resolves with a line of prose that looks exactly like an answer.
export function settleAcpPrompt(managers: Managers, label: string, result: AcpPromptResult): void {
  const tab = managers.tab.byLabel(label);
  const pending = tab?.runtime?.acpPrompt;
  if (!pending || !tab?.runtime) return;
  delete tab.runtime.acpPrompt;
  pending.abort.abort();
  const running = tab.log?.findLast((entry) => entry.running && tab.runtime?.acpEntries?.has(entry));
  if (running) managers.tab.updateRunning(label, { markdown: true }, running.output, false);
  pending.finish(result);
  managers.tab.deleteBusy(label);
  messageBus.emit('state', { type: 'dirty' });
}
