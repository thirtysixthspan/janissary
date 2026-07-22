import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { JanusClient } from './ws';
import { nextDock, dockTooltip } from './dock-cycle';
import { dockSwapIcon } from './icons';

type Properties = {
  dock?: 'left' | 'right';
  client: JanusClient;
  index: number;
  // BEM-ish class prefix (e.g. 'notifications', 'schedules') the caller's stylesheet defines
  // `<prefix>-header`/`<prefix>-actions`/`<prefix>-dock-cycle` under.
  classPrefix: string;
  children?: React.ReactNode;
};

// The dock-location-cycle button shown in a docked tab's header, shared by every tab body that
// supports the left/center/right dock cycle (NotificationsTab, SchedulesTab).
export function DockCycleHeader({ dock, client, index, classPrefix, children }: Properties) {
  return (
    <div className={`${classPrefix}-header`}>
      <div className={`${classPrefix}-actions`}>
        {children}
        {dock && <button
          type="button"
          className={`${classPrefix}-dock-cycle`}
          title={dockTooltip(nextDock(dock))}
          onClick={() => client.send({ method: 'setDock', params: { index, dock: nextDock(dock) } })}
        >
          <FontAwesomeIcon icon={dockSwapIcon} />
        </button>}
      </div>
    </div>
  );
}
