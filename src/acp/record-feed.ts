import type { AcpSessionRecords } from '../acp-records/manager.js';
import type { AcpActivityKind } from './activity.js';
import type { AcpRecordSource } from '../acp-records/types.js';
import type { TabRuntime } from '../tab/types.js';
import type { AcpPendingPrompt, PromptRuntimeState } from './prompt-state.js';
import type { AcpPromptResult } from './types.js';
import { acpRoleRuntime } from './role-state.js';
import { DEFAULT_ACP_ROLE, type AcpRole } from './role.js';
import { recordConnectionName } from '../plugins/connections/shared.js';

export function ownRecord(runtime: TabRuntime, id: string): void {
  runtime.acpRecordIds ??= new Set();
  runtime.acpRecordIds.add(id);
}

export function beginCoreRecord(
  records: AcpSessionRecords, runtime: TabRuntime, source: AcpRecordSource, state?: PromptRuntimeState,
): void {
  const role = source.kind === 'acp' ? source.role ?? DEFAULT_ACP_ROLE : DEFAULT_ACP_ROLE;
  const target = state ?? acpRoleRuntime(runtime, role);
  if (!target.recordId) {
    target.recordId = records.begin(source);
    target.recordName = recordConnectionName({ kind: 'acp', role, ownerName: source.ownerName });
  }
  ownRecord(runtime, target.recordId);
  if (target.prompt) promptCoreRecord(records, runtime, target.prompt);
}

export function promptCoreRecord(records: AcpSessionRecords, runtime: TabRuntime, pending: AcpPendingPrompt): void {
  const state = pending.state ?? acpRoleRuntime(runtime, pending.role);
  const recordId = state.recordId;
  if (!recordId || pending.recordId) return;
  if (records.prompt(recordId, pending.prompt, pending.prompt, pending.preamble)) {
    pending.recordId = recordId;
    if (state.recordName) pending.recordName = state.recordName;
  }
}

export function coreActivity(
  records: AcpSessionRecords, runtime: TabRuntime, kind: AcpActivityKind, text: string,
  role: AcpRole = DEFAULT_ACP_ROLE, toolPhase?: 'command' | 'reply', toolCommand?: string,
  state?: PromptRuntimeState,
): void {
  const target = state ?? acpRoleRuntime(runtime, role);
  const id = target.prompt?.recordId;
  if (!id || id !== target.recordId) return;
  if (toolPhase === undefined) records.activity(id, kind, text);
  else if (toolCommand === undefined) records.activity(id, kind, text, toolPhase);
  else records.activity(id, kind, text, toolPhase, toolCommand);
}

export function replyCoreRecord(
  records: AcpSessionRecords, runtime: TabRuntime, text: string, role: AcpRole = DEFAULT_ACP_ROLE,
  state?: PromptRuntimeState,
): void {
  const target = state ?? acpRoleRuntime(runtime, role);
  const id = target.prompt?.recordId;
  if (!id || id !== target.recordId) return;
  records.reply(id, text);
}

export function answerCoreRecord(records: AcpSessionRecords, pending: AcpPendingPrompt, result: AcpPromptResult): void {
  if (pending.recordId) records.answer(pending.recordId, result.answered ? result.reply : result.error);
}

export function closeCoreRecord(
  records: AcpSessionRecords, runtime: TabRuntime, role: AcpRole = DEFAULT_ACP_ROLE,
  state?: PromptRuntimeState,
): void {
  const target = state ?? acpRoleRuntime(runtime, role);
  const id = target.recordId;
  delete target.recordId;
  delete target.recordName;
  if (id) records.close(id, 'Closed');
}
