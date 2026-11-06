import { randomUUID } from 'node:crypto';
import type { Managers } from '../managers.js';
import type { LogEntry } from '../tab/types.js';
import type { AcpPromptResult } from './types.js';
import { messageBus } from '../bus.js';
import { answerCoreRecord } from './record-feed.js';
import { acpRoleRuntime } from './role-state.js';
import { DEFAULT_ACP_ROLE, type AcpRole } from './role.js';

export function appendAcp(managers: Managers, label: string, entry: LogEntry): void {
  const tab = managers.tab.byLabel(label);
  if (tab) {
    tab.runtime ??= { busy: false, context: [], queue: [] };
    tab.runtime.acpEntries ??= new WeakSet();
    tab.runtime.acpEntries.add(entry);
  }
  managers.tab.append(label, entry);
}

export function appendAcpBackgroundReply(managers: Managers, label: string, input: string, result: AcpPromptResult): void {
  managers.tab.append(label, {
    input,
    output: result.answered ? result.reply : result.error,
    background: randomUUID(),
  });
}

// Settle the prompt a tab is running with the result it produced, whether the tool loop finished, the
// loop failed, or a reset closed the session underneath it. The caller hears which, because a refusal
// resolves with a line of prose that looks exactly like an answer.
export function settleAcpPrompt(
  managers: Managers, label: string, result: AcpPromptResult, afterSettlement?: () => void,
  role: AcpRole = DEFAULT_ACP_ROLE,
): void {
  const tab = managers.tab.byLabel(label);
  const runtime = tab?.runtime;
  const state = runtime ? acpRoleRuntime(runtime, role) : undefined;
  const pending = state?.prompt;
  if (!pending || !tab?.runtime) { afterSettlement?.(); return; }
  answerCoreRecord(managers.acpRecords, pending, result);
  delete state.prompt;
  pending.abort.abort();
  const running = tab.log?.findLast((entry) => entry.running && tab.runtime?.acpEntries?.has(entry));
  if (running) managers.tab.updateRunning(label, { markdown: true }, running.output, false);
  managers.tab.deleteBusy(label);
  afterSettlement?.();
  pending.finish(result);
  messageBus.emit('state', { type: 'dirty' });
}
