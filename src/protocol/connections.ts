import type { AcpRef } from './tab.js';
import type { AcpRecordRow, AcpRecordWindow } from '../acp-records/types.js';
import type { ConnectionKind } from '../connection/types.js';

export type ConnectionsTopicWindow = AcpRecordWindow;

export type ConnectionsTopicLiveRow = {
  type: 'live';
  id: string;
  kind: ConnectionKind;
  display: string;
  // Bare host the connection runs on: a remote tab's host, an ssh tab's destination host, or `Local`.
  host: string;
  ownerLabel: string;
  ownerName: string;
  status: 'Open';
  // Sort key: owning-tab activity, latest attributed SQLite-tab activity, or durable record update time.
  // Zero means no available activity; this host metric is not activity for an individual connection.
  orderingTimestamp: number;
  focusTarget?: string;
  acpRef?: AcpRef;
  // Set on the managed system tab's shell rows, which the list offers no close for.
  permanent?: true;
};

export type ConnectionsTopicRecordRow = {
  type: 'record';
  id: string;
  kind: AcpRecordRow['kind'];
  title: string;
  model: string;
  // The host captured on the record when its session or run started remotely, otherwise `Local`.
  host: string;
  ownerLabel: string;
  ownerName: string;
  runId?: string;
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
  status: AcpRecordRow['status'];
  // Durable rows use updatedAt; see the live-row definition for tab and SQLite timestamp semantics.
  orderingTimestamp: number;
  // The owning tab's label while the tab the record began in is still open, whatever the record's status.
  focusTarget?: string;
  window?: ConnectionsTopicWindow;
};

export type ConnectionsTopicRow = ConnectionsTopicLiveRow | ConnectionsTopicRecordRow;

export type ConnectionsTopicData = {
  rows: ConnectionsTopicRow[];
};
