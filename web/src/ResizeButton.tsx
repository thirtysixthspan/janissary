import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { resizeIcon } from './icons';
import { beginResizeDrag } from './drag-resize';

export function ResizeButton({ direction, label, onResize, align = 'end' }: {
  direction: 'horizontal' | 'vertical';
  label: string;
  onResize: (down: React.MouseEvent, move: MouseEvent) => void;
  // Which edge of its tabstrip the button hugs. The right sidebar's inner border sits on
  // its *left* edge (the shared border with the app area), so its button floats to the
  // start of the strip instead of the default end.
  align?: 'start' | 'end';
}) {
  return (
    <button
      type="button"
      className={`resize-button resize-${direction} resize-align-${align}`}
      title={label}
      aria-label={label}
      onMouseDown={(down) => beginResizeDrag(down, onResize)}
    >
      <FontAwesomeIcon icon={resizeIcon} />
    </button>
  );
}
