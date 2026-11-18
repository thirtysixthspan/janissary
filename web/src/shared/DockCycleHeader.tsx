import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { nextDock, dockTooltip } from './dock-cycle';
import { dockSwapIcon } from './icons';

type Properties = {
  dock?: 'left' | 'right';
  onCycle(next: 'left' | 'right'): void;
  // BEM-ish class prefix (e.g. 'notifications', 'schedules') the caller's stylesheet defines
  // `<prefix>-header`/`<prefix>-actions`/`<prefix>-dock-cycle` under.
  classPrefix: string;
  children?: React.ReactNode;
};

// The dock-location-cycle button shown in a docked tab's header, shared by every tab body that
// supports the left/center/right dock cycle (NotificationsTab, SchedulesTab).
export function DockCycleHeader({ dock, onCycle, classPrefix, children }: Properties) {
  return (
    <div className={`${classPrefix}-header`}>
      <div className={`${classPrefix}-actions`}>
        {children}
        {dock && <button
          type="button"
          className={`${classPrefix}-dock-cycle`}
          title={dockTooltip(nextDock(dock))}
          onClick={() => onCycle(nextDock(dock))}
        >
          <FontAwesomeIcon icon={dockSwapIcon} />
        </button>}
      </div>
    </div>
  );
}
