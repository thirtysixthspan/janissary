import React from 'react';

/** The formats the control offers, in the order the bar shows them. */
const EXPORT_FORMATS = ['csv', 'json'] as const;

export type ExportFormat = typeof EXPORT_FORMATS[number];

/**
 * The control that starts an export, for the grid's action bar.
 *
 * An export writes the whole filtered, ordered query of the object the bar names, which is why it
 * sits beside the grid rather than in the header: the header does not know which object is
 * selected. Words rather than two download glyphs, because CSV and JSON are words.
 *
 * Both are unavailable while another request is outstanding. The tab waits on one request at a
 * time, so an export asked for now would be answered after the read that is still running, and would
 * replace the page it was meant to describe.
 */
export function ExportButtons({
  onExport, enabled,
}: {
  onExport(format: ExportFormat): void;
  enabled: boolean;
}) {
  return (
    <span className="sql-export-actions">
      {EXPORT_FORMATS.map((format) => (
        <button
          key={format}
          type="button"
          disabled={!enabled}
          onClick={() => onExport(format)}
        >
          {format.toUpperCase()}
        </button>
      ))}
    </span>
  );
}
