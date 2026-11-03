import React, { useEffect, useMemo, useRef } from 'react';
import type { RecordConnectionRow } from '@shared/plugins/connections/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ConnectionHistory } from './ConnectionHistory';
import { useConnectionsController } from './useConnectionsController';
import { useConnectionHistoryScroll } from './useConnectionHistoryScroll';

export function ConnectionTab({ record, capabilities }: {
  record: RecordConnectionRow;
  capabilities: TabPluginClientCapabilities;
}) {
  const controller = useConnectionsController(capabilities);
  const { recordUpdated } = controller;
  const historyRef = useRef<HTMLDivElement>(null);
  const { window } = record;
  const latestBlock = window?.blocks.at(-1);
  const contentKey = useMemo(() => [window?.offset, window?.blocks.length, latestBlock?.answer,
    latestBlock?.entries.length, latestBlock?.prompt], [window?.offset, window?.blocks.length,
    latestBlock?.answer, latestBlock?.entries.length, latestBlock?.prompt]);
  const scroll = useConnectionHistoryScroll(historyRef, capabilities.active, window?.offset,
    window?.hasOlder ?? false, () => controller.loadOlder(record.id), contentKey);

  useEffect(() => {
    recordUpdated(['Closed', 'Completed', 'Failed', 'Terminated'].includes(record.status));
  }, [record, recordUpdated]);

  const acp = record.kind === 'acp';
  const canCancel = acp && record.status === 'Running';
  const canClose = acp && ['Running', 'Idle'].includes(record.status);
  const canTerminate = record.kind === 'agent' && record.status === 'Running';
  return (
    <section className="connections-record plugin-tab">
      <header className="plugin-meta connections-record-header">
        <div className="connections-record-title">{record.title}</div>
        <div className="connections-record-metadata">
          <span>{record.kind}</span><span>{record.model}</span><span>{record.ownerName}</span>
          <span>{record.status}</span><span>Started {new Date(record.startedAt).toLocaleString()}</span>
          {record.endedAt !== undefined && <span>Ended {new Date(record.endedAt).toLocaleString()}</span>}
          {record.kind === 'agent' && <span>{record.runId}</span>}
          {record.kind === 'agent' && record.window?.source.kind === 'agent'
            && <span>{record.window.source.taskPath}</span>}
        </div>
        <span className="plugin-actions">
          {canCancel && <button type="button" onClick={() => controller.cancel(record.id)}>Cancel</button>}
          {canClose && <button type="button" onClick={() => controller.closeSession(record.id)}>Close session</button>}
          {canTerminate && <button type="button" disabled={controller.pendingTerminate}
            onClick={() => controller.terminate(record.id)}>Terminate</button>}
        </span>
      </header>
      {controller.error && <div className="connections-record-error" role="alert">{controller.error}</div>}
      <div className="connections-history" ref={historyRef} onScroll={(event) => scroll.onScroll(event.currentTarget)}>
        <ConnectionHistory window={window} />
      </div>
    </section>
  );
}
