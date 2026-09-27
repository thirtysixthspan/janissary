import React from 'react';
import type { VisualizationColumn, VisualizationColumnType } from '@shared/plugins/visualizations/shared';

// The columns the parser inferred, shown before the interview asks anything. A type the user cannot see
// is a type they cannot correct, and a correction that arrives after the first question is a correction
// to a conversation already resting on the wrong type — so the schema comes first and the interview waits.
//
// The four types are the four the parser infers and the four the renderer and the model branch on. A
// fifth, a currency or a percentage, would be a type nothing downstream understands, so it is not offered:
// correcting a column of currency to "number" is the change that actually helps.

const TYPES: readonly VisualizationColumnType[] = ['number', 'boolean', 'date', 'string'];

export type ReviewProperties = {
  columns: readonly VisualizationColumn[];
  busy: boolean;
  onSetType(column: string, type: VisualizationColumnType): void;
  onConfirm(): void;
};

export function SchemaReview({
  columns, busy, onSetType, onConfirm,
}: ReviewProperties): React.ReactElement {
  return (
    <div className="visualization-review">
      <p className="visualization-review-text">
        These are the columns found in the source, and the type read for each. Change anything that was
        read wrong before the questions start.
      </p>
      <ul className="visualization-review-columns">
        {columns.map((column) => (
          <li key={column.name} className="visualization-review-column">
            <span className="visualization-review-name">{column.name}</span>
            <select
              aria-label={`Type of ${column.name}`}
              value={column.type}
              disabled={busy}
              onChange={(event) => {
                onSetType(column.name, event.target.value as VisualizationColumnType);
              }}
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="visualization-review-confirm"
        disabled={busy}
        onClick={onConfirm}
      >
        Ask about this data
      </button>
    </div>
  );
}
