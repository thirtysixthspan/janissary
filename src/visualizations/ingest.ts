import type { VisualizationTableView } from '../protocol/visualizations.js';
import { chartable, parseDelimitedText, parseJsonText, type TableResult } from './table.js';

// Turning a source's text into the table a chart is drawn from, in one place. It is separate from the
// manager because none of it is stateful: given the same text it always produces the same table or the
// same reason, which is what makes every one of these failures testable without a manager, a store, or
// a subprocess anywhere in sight.
export type Ingested = { table: VisualizationTableView; error?: undefined } | { table?: undefined; error: string };

// A document that begins like JSON is meant to be JSON, so a JSON failure there is reported rather
// than replaced by whatever the delimited parser made of it — a silent fallback would report "no rows"
// for a body that is really a malformed API response. Anything else is far more often a table.
export function ingest(text: string): Ingested {
  const trimmed = text.trim();
  const parsed: TableResult = trimmed.startsWith('{') || trimmed.startsWith('[')
    ? parseJsonText(trimmed)
    : parseDelimitedText(text);
  if ('error' in parsed) return { error: parsed.error };
  const usable = chartable(parsed.table);
  if ('error' in usable) return { error: usable.error };
  return {
    table: {
      columns: parsed.table.columns,
      rows: parsed.table.rows,
      total: parsed.total,
      truncated: parsed.truncated,
    },
  };
}
