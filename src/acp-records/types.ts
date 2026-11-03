import type { AcpActivityKind } from '../acp/activity.js';

type SourceMetadata = {
  model: string;
  ownerLabel: string;
  ownerName: string;
};

export type AcpRecordSource = SourceMetadata & (
  | { kind: 'acp' }
  | { kind: 'agent'; runId: string; taskPath: string }
);

export type AcpRecordOutcome = 'Closed' | 'Completed' | 'Failed' | 'Terminated';

export type AcpRecordEntry = {
  kind: AcpActivityKind;
  text: string;
  timestamp: number;
};

export type AcpRecordBlock = {
  prompt: string;
  startedAt: number;
  entries: AcpRecordEntry[];
  answer?: string;
  endedAt?: number;
};

export type AcpRecord = {
  schemaVersion: 1;
  id: string;
  source: AcpRecordSource;
  title: string;
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
  outcome?: AcpRecordOutcome;
  blocks: AcpRecordBlock[];
};

export type AcpRecordRow = {
  id: string;
  kind: AcpRecordSource['kind'];
  title: string;
  model: string;
  ownerLabel: string;
  ownerName: string;
  runId?: string;
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
  status: 'Idle' | 'Running' | AcpRecordOutcome;
};

export type AcpRecordWindow = AcpRecordRow & {
  source: AcpRecordSource;
  blocks: AcpRecordBlock[];
  totalBlocks: number;
  offset: number;
  hasOlder: boolean;
};
