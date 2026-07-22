import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { resizeIcon } from './icons';
import { startDrag } from './drag-resize';

export function ResizeButton({ direction, label, onResize }: {
  direction: 'horizontal' | 'vertical';
  label: string;
  onResize: (down: React.MouseEvent, move: MouseEvent) => void;
}) {
  const onMouseDown = (down: React.MouseEvent) => {
    down.preventDefault();
    down.stopPropagation();
    const move = (event: MouseEvent) => onResize(down, event);
    startDrag(move);
  };

  return (
    <button
      type="button"
      className={`resize-button resize-${direction}`}
      title={label}
      aria-label={label}
      onMouseDown={onMouseDown}
    >
      <FontAwesomeIcon icon={resizeIcon} />
    </button>
  );
}
