import type { VisualizationTableView } from '../protocol/visualizations.js';
import { chartable, parseDelimitedText, parseJsonText, type TableResult } from './table.js';

// Turning a source's text into one of three things: a table a chart can be drawn from, a document the
// model has to work out how to turn into data, or the reason it is neither. It is separate from the
// parsers because which of the three is the right answer is a judgement about what a source *is* — a
// page describing an API is not a failed table — and that judgement belongs with a name of its own.
//
// It is apart from the manager because none of it is stateful: given the same text it always produces
// the same answer, which is what makes every one of these failures testable without a manager, a
// store, or a subprocess anywhere in sight.

// How much of a page is kept. The read itself is bounded at eight megabytes, which is far more than a
// prompt should ever carry, and a model handed three hundred kilobytes of a documentation site is a
// model handed the answer to a question it was about to reason about.
export const MAX_DOCUMENT_CHARS = 20_000;

export type Ingested =
  | { table: VisualizationTableView; document?: undefined; error?: undefined }
  | { table?: undefined; document: string; error?: undefined }
  | { table?: undefined; document?: undefined; error: string };

export function ingest(text: string): Ingested {
  const trimmed = text.trim();
  if (trimmed === '') return { error: 'the source is empty' };
  // A document that begins like JSON is meant to be JSON, so a JSON failure there is reported rather
  // than replaced by whatever the delimited parser made of it — a silent fallback would report "no
  // rows" for a body that is really a malformed API response.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return tableOr(parseJsonText(trimmed), trimmed);
  }
  return tableOr(parseDelimitedText(text), text);
}

function tableOr(parsed: TableResult, original: string): Ingested {
  if ('error' in parsed) return { error: parsed.error };
  const usable = chartable(parsed.table);
  if ('error' in usable) {
    // One column and nothing worth measuring is what a web page, a YAML file and a markdown document
    // all look like to a delimiter sniffer, and reporting "the source has no numeric column to
    // measure" to someone who pointed at their own API documentation is a message about the wrong
    // thing — so the body is handed to the model, which is the thing that can work out what it is.
    // Two columns is a delimited file that genuinely cannot be charted, and that is worth saying.
    return parsed.table.columns.length < 2
      ? { document: original.slice(0, MAX_DOCUMENT_CHARS) }
      : { error: usable.error };
  }
  return {
    table: {
      columns: parsed.table.columns,
      rows: parsed.table.rows,
      total: parsed.total,
      truncated: parsed.truncated,
    },
  };
}
