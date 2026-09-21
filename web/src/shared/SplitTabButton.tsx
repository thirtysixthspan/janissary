import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { splitTabIcon } from './icons';

export function SplitTabButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="tab-split"
      title="Split"
      aria-label="Split"
      onClick={onClick}
    >
      <FontAwesomeIcon icon={splitTabIcon} />
    </button>
  );
}
