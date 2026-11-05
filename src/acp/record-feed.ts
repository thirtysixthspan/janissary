import type { AcpSessionRecords } from '../acp-records/manager.js';
import type { AcpActivityKind } from './activity.js';
import type { AcpRecordSource } from '../acp-records/types.js';
import type { TabRuntime } from '../tab/types.js';
import type { AcpPendingPrompt } from './prompt-state.js';
import type { AcpPromptResult } from './types.js';

export function ownRecord(runtime: TabRuntime, id: string): void {
  runtime.acpRecordIds ??= new Set();
  runtime.acpRecordIds.add(id);
}

export function beginCoreRecord(records: AcpSessionRecords, runtime: TabRuntime, source: AcpRecordSource): void {
  runtime.acpRecordId ??= records.begin(source);
  ownRecord(runtime, runtime.acpRecordId);
  if (runtime.acpPrompt) promptCoreRecord(records, runtime, runtime.acpPrompt);
}

export function promptCoreRecord(records: AcpSessionRecords, runtime: TabRuntime, pending: AcpPendingPrompt): void {
  if (!runtime.acpRecordId || pending.recordId) return;
  if (records.prompt(runtime.acpRecordId, pending.prompt)) pending.recordId = runtime.acpRecordId;
}

export function coreActivity(records: AcpSessionRecords, runtime: TabRuntime, kind: AcpActivityKind, text: string): void {
  const id = runtime.acpPrompt?.recordId;
  if (id && id === runtime.acpRecordId) records.activity(id, kind, text);
}

export function answerCoreRecord(records: AcpSessionRecords, pending: AcpPendingPrompt, result: AcpPromptResult): void {
  if (pending.recordId) records.answer(pending.recordId, result.answered ? result.reply : result.error);
}

export function closeCoreRecord(records: AcpSessionRecords, runtime: TabRuntime): void {
  const id = runtime.acpRecordId;
  delete runtime.acpRecordId;
  if (id) records.close(id, 'Closed');
}
