import type { Managers } from '../managers.js';
import type { ConnectionsTopicData } from '../protocol/connections.js';
import type { ConnectionsTopicAction } from './api-topics-connections.js';
import { ACP_RECORD_WINDOW_SIZE } from '../acp-records/model.js';
import { listLines } from '../connection/list.js';
import { composeConnectionsTopicData } from './connections-topic-rows.js';

function consume(pending: Promise<unknown>): void {
  void pending.catch(() => {});
}

function rows(managers: Managers, requested: Map<string, number>): ConnectionsTopicData['rows'] {
  return composeConnectionsTopicData(managers, requested).rows;
}

type RecordAction = Extract<ConnectionsTopicAction, { action: 'load' | 'loadOlder' | 'delete' }>;
type CoreRecordAction = Extract<ConnectionsTopicAction, { action: 'cancel' | 'closeSession' }>;

function isRecordAction(action: ConnectionsTopicAction): action is RecordAction {
  return ['load', 'loadOlder', 'delete'].includes(action.action);
}

function isCoreRecordAction(action: ConnectionsTopicAction): action is CoreRecordAction {
  return ['cancel', 'closeSession'].includes(action.action);
}

function actOnRecord(managers: Managers, action: RecordAction, requested: Map<string, number>): void {
  if (action.action === 'load') {
    if (managers.acpRecords.rows().every((record) => record.id !== action.id)) return;
    requested.set(action.id, ACP_RECORD_WINDOW_SIZE);
    return;
  }
  if (action.action === 'loadOlder') {
    const count = requested.get(action.id);
    if (count === undefined) return;
    const window = managers.acpRecords.window(action.id, count);
    if (!window?.hasOlder) return;
    requested.set(action.id, Math.max(ACP_RECORD_WINDOW_SIZE, Math.min(window.totalBlocks, count + ACP_RECORD_WINDOW_SIZE)));
    return;
  }
  if (action.action === 'delete') {
    const record = managers.acpRecords.rows().find((row) => row.id === action.id);
    if (!record || ['Idle', 'Running'].includes(record.status)) return;
    if (managers.acpRecords.delete(action.id)) requested.delete(action.id);
  }
}

type LiveAction = Extract<ConnectionsTopicAction, { action: 'open' | 'close' }>;

function actOnLive(managers: Managers, action: LiveAction, requested: Map<string, number>): void {
  const row = rows(managers, requested).find((candidate) => candidate.type === 'live'
    && candidate.kind === action.kind && candidate.id === action.id
    && candidate.ownerLabel === action.ownerLabel);
  if (!row || row.type !== 'live') return;
  if (action.action === 'open') {
    if (row.focusTarget === undefined) return;
    const index = managers.tab.findIndex(row.focusTarget);
    if (index !== -1) managers.tab.setActiveTab(index);
  } else if (action.action === 'close') {
    void managers.connection.closeTarget(row.kind, row.id, row.ownerLabel).catch(() => {});
  }
}

function actOnCoreRecord(managers: Managers, action: CoreRecordAction, requested: Map<string, number>): void {
  const record = rows(managers, requested).find((candidate) => candidate.type === 'record' && candidate.id === action.id);
  if (!record || record.type !== 'record' || record.kind !== 'acp') return;
  const owner = managers.tab.byLabel(record.ownerLabel);
  if (!owner || owner.runtime?.acpRecordId !== record.id) return;
  if (action.action === 'cancel' && record.status === 'Running') consume(managers.acp.cancel(record.ownerLabel));
  if (action.action === 'closeSession' && ['Idle', 'Running'].includes(record.status)) managers.acp.close(record.ownerLabel);
}

type TerminateAction = Extract<ConnectionsTopicAction, { action: 'terminate' }>;

function actOnAgentRecord(managers: Managers, action: TerminateAction, requested: Map<string, number>): void {
  const record = rows(managers, requested).find((candidate) => candidate.type === 'record' && candidate.id === action.id);
  if (!record || record.type !== 'record' || record.kind !== 'agent' || !record.runId) return;
  if (managers.agent.isLive(record.runId) && managers.agent.isAgentRun(record.runId)) {
    consume(managers.agent.finish(record.runId, 'terminated'));
  }
}

export function connectionsTopicAction(
  managers: Managers,
  action: ConnectionsTopicAction,
  requested: Map<string, number>,
): string | undefined {
  if (action.action === 'list') {
    const lines = listLines(managers, action.label);
    return lines.length > 0 ? lines.join('\n') : 'No open connections.';
  }
  if (action.action === 'open' || action.action === 'close') {
    actOnLive(managers, action, requested);
    return undefined;
  }
  if (action.action === 'closeCommand') {
    void managers.connection.closeTarget(action.kind, action.id, action.label).catch(() => {});
    return undefined;
  }
  if (isRecordAction(action)) {
    actOnRecord(managers, action, requested);
    return undefined;
  }
  if (isCoreRecordAction(action)) {
    actOnCoreRecord(managers, action, requested);
    return undefined;
  }
  actOnAgentRecord(managers, action, requested);
  return undefined;
}
