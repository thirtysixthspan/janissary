import { randomUUID } from 'node:crypto';
import type { CommandInvocationContext } from '../commands/types.js';
import type { Managers } from '../managers.js';
import type { LogEntry } from '../tab/types.js';
import type { AcpPromptResult } from './types.js';
import { messageBus } from '../bus.js';
import { errorText } from '../error-text.js';
import { recordConnectionName } from '../plugins/connections/shared.js';
import { answerCoreRecord } from './record-feed.js';
import { acpRoleRuntime } from './role-state.js';
import { DEFAULT_ACP_ROLE, type AcpRole } from './role.js';

export type AcpDispatchReceipt = { replyId: string; role: AcpRole; name: string };

export function appendAcp(managers: Managers, label: string, entry: LogEntry): void {
  const tab = managers.tab.byLabel(label);
  if (tab) {
    tab.runtime ??= { busy: false, context: [], queue: [] };
    tab.runtime.acpEntries ??= new WeakSet();
    tab.runtime.acpEntries.add(entry);
  }
  managers.tab.append(label, entry);
}

export function appendAcpBackgroundReply(
  managers: Managers, label: string, input: string, result: AcpPromptResult, id: string,
): void {
  managers.tab.append(label, {
    input,
    output: result.answered ? result.reply : result.error,
    background: id,
  });
}

export function runAcpCommand(
  command: string,
  tab: { label: string; index: number },
  managers: Managers,
  invocation: CommandInvocationContext | undefined,
  role: AcpRole,
): AcpDispatchReceipt {
  const line = invocation?.line ?? command;
  const replyId = randomUUID();
  const receipt: AcpDispatchReceipt = {
    replyId,
    role,
    name: recordConnectionName({
      kind: 'acp', role, ownerName: managers.tab.byLabel(tab.label)?.title ?? tab.label,
    }),
  };
  let settled = false;
  const settle = (result: AcpPromptResult) => {
    if (settled) return;
    settled = true;
    appendAcpBackgroundReply(managers, tab.label, line, result, replyId);
  };
  void managers.acp.promptResult(tab.label, command, role, { appendRefusalToTranscript: false }).then(
    settle,
    (error: unknown) => settle({ answered: false, error: `ACP error: ${errorText(error)}` }),
  );
  return receipt;
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
  if (!tab || !runtime || !state || !pending) { afterSettlement?.(); return; }
  answerCoreRecord(managers.acpRecords, pending, result);
  delete state.prompt;
  pending.abort.abort();
  const running = tab.log?.findLast((entry) => entry.running && pending.runningEntries.has(entry));
  if (running) managers.tab.updateRunning(label, { markdown: true, entries: pending.runningEntries }, running.output, false);
  managers.tab.deleteBusy(label, pending);
  afterSettlement?.();
  pending.finish(pending.recordId ? { ...result, recordId: pending.recordId } : result);
  messageBus.emit('state', { type: 'dirty' });
}
