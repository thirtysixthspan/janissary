import React from 'react';
import type { TabView, ConnectionView } from '@shared/protocol';
import type { StatusWindowHandlers } from './useStatusWindows';

type Properties = {
  tab: TabView;
  scheduleOnly?: boolean;
  connections: StatusWindowHandlers;
  schedule: StatusWindowHandlers;
  interactive?: boolean;
  // Renders a close control on each connection row when supplied (editor tabs' persona
  // connections); omitted elsewhere, so agent-tab rows stay read-only, as today.
  onCloseRow?: (row: ConnectionView, index: number) => void;
};

// Floating top-right panels mirroring the Ink ConnectionWindow / ScheduleWindow: the active
// tab's open connections (shell / acp / terminal cards / sqlite) and its scheduled timers.
// Each renders only while its window has content *and* `useStatusWindows` marks it visible
// (hover, pin, or the post-activation auto-show); the schedule panel stacks below the
// connections panel. `scheduleOnly` drops the connections panel — used over harness tabs, where
// the whole tab *is* the terminal connection and only the timers are worth overlaying.
// `interactive` accepts pointer events on the panels themselves (agent tabs, Decision 8); on
// harness tabs the panels stay non-interactive so they never intercept terminal input.
export function StatusPanels({ tab, scheduleOnly = false, connections: connectionsWindow, schedule: scheduleWindow, interactive = false, onCloseRow }: Properties) {
  const scheduleRows = tab.schedule;
  const connectionRows = scheduleOnly ? [] : tab.connections;
  const showConnections = connectionRows.length > 0 && connectionsWindow.visible;
  const showSchedule = scheduleRows.length > 0 && scheduleWindow.visible;
  if (!showConnections && !showSchedule) return null;
  return (
    <div className={`status-panels${interactive ? ' status-panels-interactive' : ''}`} data-doc-shot="status-panels">
      {showConnections && (
        <div
          className="panel"
          style={{ opacity: connectionsWindow.opacity }}
          onMouseEnter={interactive ? connectionsWindow.onWindowEnter : undefined}
          onMouseLeave={interactive ? connectionsWindow.onWindowLeave : undefined}
        >
          <div className="panel-title">connections</div>
          {connectionRows.map((c, index) => (
            <div key={index} className={`panel-row conn-${c.kind}`}>
              {c.text}
              {onCloseRow && (
                <button
                  type="button"
                  className="panel-row-close"
                  title="Close connection"
                  aria-label="Close connection"
                  onClick={() => onCloseRow(c, index)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {showSchedule && (
        <div
          className="panel"
          style={{ opacity: scheduleWindow.opacity }}
          onMouseEnter={interactive ? scheduleWindow.onWindowEnter : undefined}
          onMouseLeave={interactive ? scheduleWindow.onWindowLeave : undefined}
        >
          <div className="panel-title">schedule</div>
          {scheduleRows.map((s) => (
            <div key={s.id} className={`panel-row${s.recurring ? ' recurring' : ''}`}>
              {`${s.id}  ${s.spec}  (next: ${s.next})`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
