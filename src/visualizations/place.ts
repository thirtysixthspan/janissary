import { randomUUID } from 'node:crypto';
import { datasetFor, placed, roomFor } from './charts.js';
import { datasetKey } from './chart-spec.js';
import { MAX_DATASETS } from './chart-record.js';
import type { Reply } from './reply.js';
import type { VisualizationRecord } from './store.js';
import type { VisualizationChartRecord, VisualizationDataRef } from '../protocol.js';

// Placing a reply's charts, and saying which of them could not be placed. Split from the agent because
// this is the part of a reply that touches the record rather than the exchange: it acquires data, spends
// the ceilings, and returns the first chart, and none of that needs the session, the turns or the
// in-flight bookkeeping the agent holds.

export type Acquire = (record: VisualizationRecord, data: VisualizationDataRef) => void;

// The first chart the reply drew, which is the one the sentence describes and the one an untitled
// visualization takes its name from. A chart naming a file the agent has just acquired is given that data
// before it is placed, because the file is the only place it can be — so the check that would refuse the
// chart comes first, or a reply naming fifty files would spend the dataset ceiling on charts that were
// about to be refused anyway.
export function place(
  record: VisualizationRecord,
  entries: Reply['charts'],
  refused: string[],
  acquire: Acquire,
): VisualizationChartRecord | undefined {
  let first: VisualizationChartRecord | undefined;
  const room = roomFor(record, entries.length, refused);
  for (const entry of entries.slice(0, room)) {
    if (entry.data !== undefined) {
      // A data reference the record already holds costs nothing; a new one is refused here rather than
      // after the read, because the ceiling is on what a record may carry at all and a dataset written
      // past it would make the whole record unreadable.
      if (datasetFor(record, datasetKey(entry.data)) === undefined
        && record.datasets.length >= MAX_DATASETS) {
        refused.push(`A visualization may read ${MAX_DATASETS} data sources, and this one already reads them all.`);
        continue;
      }
      acquire(record, entry.data);
    }
    const result = placed(record, entry, randomUUID);
    if ('error' in result) {
      refused.push(`Not drawn: ${result.error}.`);
      continue;
    }
    first ??= result.chart;
  }
  return first;
}
