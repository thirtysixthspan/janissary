import { ingest } from './ingest.js';
import type { VisualizationIndex } from './index.js';
import type { VisualizationReview } from './review.js';
import type { VisualizationRecord } from './store.js';

// Reading a source once, and nothing about when. `VisualizationRefresh` owns the interval; this owns the
// single read, so the manager holds the sequence rather than the pipeline, and the pipeline's two rules —
// one read in flight per record, and a read that opens the review rather than the interview — are stated
// once instead of in the middle of a manager.

export type ReadingOptions = {
  // The bound fetch, already carrying its timeout, size cap, and redirect policy.
  read(source: string): Promise<{ text: string } | { error: string }>;
  index: VisualizationIndex;
  review: VisualizationReview;
  now(): number;
  commit(record: VisualizationRecord, error?: string): void;
};

export function reader(options: ReadingOptions): (id: string) => void {
  // A read already in flight is dropped rather than queued: a fast refresh interval would otherwise build
  // a backlog of fetches whose results arrive after the one that superseded them.
  const inFlight = new Set<string>();
  return (id) => {
    if (inFlight.has(id)) return;
    const record = options.index.live(id);
    if (!record) return;
    inFlight.add(id);
    void options.read(record.source).then((result) => {
      inFlight.delete(id);
      // The record is read again here rather than closed over from above, so a delete or a close while the
      // read was in flight wins over a result nobody is waiting for.
      const current = options.index.find(id);
      if (!current || options.index.isDeleted(id)) return;
      if ('error' in result) return options.commit(current, result.error);
      const ingested = ingest(result.text);
      if (ingested.error !== undefined) return options.commit(current, ingested.error);
      options.review.read(current, ingested.table);
      current.readAt = options.now();
      options.commit(current);
    });
  };
}
