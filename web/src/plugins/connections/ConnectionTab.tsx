import React, { useEffect, useMemo, useRef } from 'react';
import type { RecordConnectionRow } from '@shared/plugins/connections/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ConnectionHistory } from './ConnectionHistory';
import { ConnectionTabMeta } from './ConnectionTabMeta';
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
  const latestActivityText = latestBlock?.entries.at(-1)?.text;
  const contentKey = useMemo(() => [window?.offset, window?.blocks.length, latestBlock?.answer,
    latestActivityText, latestBlock?.entries.length, latestBlock?.prompt], [window?.offset, window?.blocks.length,
    latestActivityText, latestBlock?.answer, latestBlock?.entries.length, latestBlock?.prompt]);
  const scroll = useConnectionHistoryScroll(historyRef, capabilities.active, window?.offset,
    window?.hasOlder ?? false, () => controller.loadOlder(record.id), contentKey);

  useEffect(() => {
    recordUpdated(['Closed', 'Completed', 'Failed', 'Terminated'].includes(record.status));
  }, [record, recordUpdated]);

  return (
    <section className="connections-record plugin-tab">
      <ConnectionTabMeta
        record={record}
        pendingTerminate={controller.pendingTerminate}
        onFocus={() => { controller.focus(record.id); }}
        onCancel={() => { controller.cancel(record.id); }}
        onCloseSession={() => { controller.closeSession(record.id); }}
        onTerminate={() => { controller.terminate(record.id); }}
      />
      {controller.error && <div className="connections-record-error" role="alert">{controller.error}</div>}
      <div className="connections-history" ref={historyRef} onScroll={(event) => scroll.onScroll(event.currentTarget)}>
        <ConnectionHistory window={window} openLink={(href) => capabilities.openLink?.(href)} />
      </div>
    </section>
  );
}
