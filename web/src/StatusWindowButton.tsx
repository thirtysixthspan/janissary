import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

type Properties = {
  icon: IconDefinition;
  className: string;
  hasContent: boolean;
  activeTitle: string;
  emptyTitle: string;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
};

// A meta-bar button driving a status window (connections/schedule): active and hover/pin-clickable
// when its window has content, dark and inert with an explanatory tooltip when it does not.
export function StatusWindowButton({ icon, className, hasContent, activeTitle, emptyTitle, onEnter, onLeave, onClick }: Properties) {
  return (
    <button
      type="button"
      className={`${className}${hasContent ? '' : ' status-window-button-empty'}`}
      title={hasContent ? activeTitle : emptyTitle}
      disabled={!hasContent}
      onMouseEnter={hasContent ? onEnter : undefined}
      onMouseLeave={hasContent ? onLeave : undefined}
      onClick={hasContent ? onClick : undefined}
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  );
}
