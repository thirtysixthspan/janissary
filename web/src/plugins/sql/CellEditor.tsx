import React from 'react';
import { InlineEditInput } from '../api';

// The cell editor: the host's inline-edit field plus a `Set NULL` toggle.
//
// The toggle is what makes a null and the four characters `NULL` two different acts rather than one
// ambiguous one. Without it, "the value is empty" would have to mean both, and a grid that draws both
// as a blank cell has already lost the difference.
//
// The toggle is part of the value being edited, not a write of its own: it sets local state, and the
// inline field's own commit carries the null, so Enter and blur write and Escape does not. Committing
// on the click was worse than it looked — the field commits on blur too, so ticking the toggle fired
// two writes, the unchanged text and then the null, on a surface where the user believes nothing
// happens until they say so.
export function CellEditor({
  cell, onCommit, onCancel,
}: {
  cell: { text: string; isNull: boolean } | undefined;
  onCommit(value: string | null): void;
  onCancel(): void;
}) {
  const [text, setText] = React.useState(cell?.text ?? '');
  const [isNull, setIsNull] = React.useState(cell?.isNull ?? false);
  return (
    <span className="sql-cell-editor">
      <InlineEditInput
        className="sql-cell-input"
        value={isNull ? '' : text}
        onChange={setText}
        onCommit={() => onCommit(isNull ? null : text)}
        onCancel={onCancel}
      />
      <label className="sql-cell-null">
        <input
          type="checkbox"
          checked={isNull}
          onChange={(event) => setIsNull(event.target.checked)}
          aria-label="Set NULL"
        />
        NULL
      </label>
    </span>
  );
}
