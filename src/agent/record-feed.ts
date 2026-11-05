import type { AcpSessionRecords } from '../acp-records/manager.js';
import type { AcpActivityKind } from '../acp/activity.js';
import type { AgentOutcome } from './run.js';

type AgentRecordMetadata = { model: string; ownerLabel: string; ownerName: string; taskPath: string; host?: string };

export function validateAgentRecordMetadata(source: AgentRecordMetadata): AgentRecordMetadata {
  if (Object.values(source).some((value) => typeof value !== 'string' || !value.trim())) {
    throw new Error('Invalid ACP record source.');
  }
  return { ...source };
}

export class AgentRecordFeed {
  readonly id: string;
  private ended = false;

  constructor(private records: AcpSessionRecords, metadata: AgentRecordMetadata, runId: string) {
    this.id = records.begin({ ...metadata, kind: 'agent', runId });
  }

  prompt(text: string): void {
    if (!this.ended) this.records.prompt(this.id, text);
  }

  activity(kind: AcpActivityKind, text: string): void {
    if (!this.ended) this.records.activity(this.id, kind, text);
  }

  finish(outcome: AgentOutcome, response: string | undefined): void {
    if (this.ended) return;
    this.ended = true;
    const text = outcome === 'terminated' ? 'Agent terminated.'
      : response ?? (outcome === 'failed' ? 'Agent failed.' : '');
    this.records.answer(this.id, text);
    this.records.close(this.id, outcome === 'completed' ? 'Completed' : outcome === 'failed' ? 'Failed' : 'Terminated');
  }
}
