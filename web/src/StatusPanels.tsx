import React from 'react';
import type { TabView } from './protocol';

// Floating top-right panels mirroring the Ink ConnectionWindow / ScheduleWindow: the active
// tab's open connections (shell / acp / terminal cards / sqlite) and its scheduled timers.
// Each is shown only when it has rows; the schedule panel stacks below the connections panel.
export function StatusPanels({ tab }: { tab: TabView }) {
  const { connections, schedule } = tab;
  if (connections.length === 0 && schedule.length === 0) return null;
  return (
    <div className="status-panels">
      {connections.length > 0 && (
        <div className="panel">
          <div className="panel-title">connections</div>
          {connections.map((c, index) => (
            <div key={index} className={`panel-row conn-${c.kind}`}>{c.text}</div>
          ))}
        </div>
      )}
      {schedule.length > 0 && (
        <div className="panel">
          <div className="panel-title">schedule</div>
          {schedule.map((s) => (
            <div key={s.id} className={`panel-row${s.recurring ? ' recurring' : ''}`}>
              {`${s.id}  ${s.spec}  (next: ${s.next})`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
