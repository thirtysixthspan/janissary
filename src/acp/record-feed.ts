import type { AcpSessionRecords } from '../acp-records/manager.js';
import type { AcpActivityKind } from './activity.js';
import type { AcpRecordSource } from '../acp-records/types.js';
import type { TabRuntime } from '../tab/types.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import type { AcpPromptResult } from './types.js';
import { acpRoleRuntime } from './role-state.js';
import { DEFAULT_ACP_ROLE, type AcpRole } from './role.js';
import { recordConnectionName } from '../plugins/connections/shared.js';

export function ownRecord(runtime: TabRuntime, id: string): void {
  runtime.acpRecordIds ??= new Set();
  runtime.acpRecordIds.add(id);
}

export function beginCoreRecord(records: AcpSessionRecords, runtime: TabRuntime, source: AcpRecordSource): void {
  const role = source.kind === 'acp' ? source.role ?? DEFAULT_ACP_ROLE : DEFAULT_ACP_ROLE;
  const state = acpRoleRuntime(runtime, role);
  if (!state.recordId) {
    state.recordId = records.begin(source);
    state.recordName = recordConnectionName({ kind: 'acp', role, ownerName: source.ownerName });
  }
  ownRecord(runtime, state.recordId);
  if (state.prompt) promptCoreRecord(records, runtime, state.prompt);
}

export function promptCoreRecord(records: AcpSessionRecords, runtime: TabRuntime, pending: AcpPendingPrompt): void {
  const recordId = acpRoleRuntime(runtime, pending.role).recordId;
  if (!recordId || pending.recordId) return;
  if (records.prompt(recordId, pending.prompt)) {
    pending.recordId = recordId;
    const recordName = acpRoleRuntime(runtime, pending.role).recordName;
    if (recordName) pending.recordName = recordName;
  }
}

export function coreActivity(
  records: AcpSessionRecords, runtime: TabRuntime, kind: AcpActivityKind, text: string,
  role: AcpRole = DEFAULT_ACP_ROLE,
): void {
  const state = acpRoleRuntime(runtime, role);
  const id = state.prompt?.recordId;
  if (id && id === state.recordId) records.activity(id, kind, text);
}

export function answerCoreRecord(records: AcpSessionRecords, pending: AcpPendingPrompt, result: AcpPromptResult): void {
  if (pending.recordId) records.answer(pending.recordId, result.answered ? result.reply : result.error);
}

export function closeCoreRecord(
  records: AcpSessionRecords, runtime: TabRuntime, role: AcpRole = DEFAULT_ACP_ROLE,
): void {
  const state = acpRoleRuntime(runtime, role);
  const id = state.recordId;
  delete state.recordId;
  delete state.recordName;
  if (id) records.close(id, 'Closed');
}
