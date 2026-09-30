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
// happens until they say so. Stopping the press from moving the caret closes the other half of that
// trap: a browser blurs the field on the way to the box, the blur committed the text as it stood, and
// the editor unmounted before the toggle was read. Preventing the press's default keeps the caret
// where the user left it, so the null is what Enter carries.
//
// A cell that already holds null is the one a user opens this editor on to fill in, and pinning the
// field empty while the toggle is on threw those keystrokes away: React restored `''` on every one of
// them, so typing looked like nothing happening and Enter wrote the null back. The field cannot be
// disabled the way the insert form's is -- a null the user is here to replace is the one value a
// disabled field could never take -- so the toggle gets out of the way instead. The first keystroke
// clears it, and what was typed is the value: the field showed nothing, so nothing is what the typed
// text is added to. Unticking with nothing typed still restores the text the cell held.
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
        onChange={(value) => {
          setText(value);
          if (isNull) setIsNull(false);
        }}
        onCommit={() => onCommit(isNull ? null : text)}
        onCancel={onCancel}
      />
      <label className="sql-cell-null" onMouseDown={(event) => event.preventDefault()}>
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
