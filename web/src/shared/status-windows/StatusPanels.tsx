import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { ConnectionView, ScheduleView, AcpRef } from '@shared/protocol';
import type { StatusWindowHandlers } from './useStatusWindows';
import { viewCaptureIcon } from '../icons';

type Properties = {
  // The rows themselves rather than the tab they came from. A plugin holding its own payload has no
  // `TabView` to pass, and the host pushes these two lists into a plugin payload precisely so this
  // component stays renderable there — one panel implementation rather than two.
  connections: ConnectionView[];
  schedule: ScheduleView[];
  scheduleOnly?: boolean;
  connectionsWindow: StatusWindowHandlers;
  scheduleWindow: StatusWindowHandlers;
  interactive?: boolean;
  // Renders a close control when supplied (editor tabs' persona connections); omitted elsewhere,
  // so agent-tab rows stay read-only, as today. `canCloseRow` narrows that control to the rows the
  // caller can actually close, keeping a window's other rows read-only.
  onCloseRow?: (row: ConnectionView, index: number) => void;
  canCloseRow?: (row: ConnectionView) => boolean;
  // Renders a clipboard-icon transcript button on any row carrying an `acpRef`, when supplied;
  // omitted on the non-interactive harness-tab panel, where no button renders.
  onOpenAcpTranscript?: (ref: AcpRef) => void;
  // Opens the connection tab behind a row. Only durable record ids and tab-scoped ACP references
  // have a tab to open; monitor and editor rows stay snapshot-only.
  onOpenRow?: (row: ConnectionView) => void;
};

function rowCanOpen(row: ConnectionView): boolean {
  return row.recordId !== undefined || row.acpRef?.scope === 'tab';
}

function ConnectionRow({ row, index, onCloseRow, canCloseRow, onOpenAcpTranscript, onOpenRow }: {
  row: ConnectionView;
  index: number;
  onCloseRow?: (row: ConnectionView, index: number) => void;
  canCloseRow?: (row: ConnectionView) => boolean;
  onOpenAcpTranscript?: (ref: AcpRef) => void;
  onOpenRow?: (row: ConnectionView) => void;
}) {
  const acpRef = row.acpRef;
  const openRow = onOpenRow !== undefined && rowCanOpen(row) ? () => { onOpenRow(row); } : undefined;
  const closeRow = onCloseRow !== undefined && (canCloseRow === undefined || canCloseRow(row)) ? onCloseRow : undefined;
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!openRow || event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openRow();
  };
  return (
    <div
      className={`panel-row conn-${row.kind}`}
      role={openRow ? 'button' : undefined}
      tabIndex={openRow ? 0 : undefined}
      onClick={openRow}
      onKeyDown={openRow ? onKeyDown : undefined}
    >
      {row.text}
      {acpRef && onOpenAcpTranscript && (
        <button
          type="button"
          className="panel-row-transcript"
          title="Open transcript"
          aria-label="Open transcript"
          onClick={(event) => { event.stopPropagation(); onOpenAcpTranscript(acpRef); }}
        >
          <FontAwesomeIcon icon={viewCaptureIcon} />
        </button>
      )}
      {closeRow && (
        <button
          type="button"
          className="panel-row-close"
          title="Close connection"
          aria-label="Close connection"
          onClick={(event) => { event.stopPropagation(); closeRow(row, index); }}
        >
          ×
        </button>
      )}
    </div>
  );
}

// Floating top-right panels mirroring the Ink ConnectionWindow / ScheduleWindow: the active
// tab's open connections (shell / acp / terminal cards / sqlite) and its scheduled timers.
// Each renders only while it has rows *and* `useStatusWindows` marks it visible (hover, pin, or
// the post-activation auto-show); the schedule panel stacks below the connections panel.
// `scheduleOnly` drops the connections panel — used over non-ssh harness tabs, where the whole tab
// *is* the terminal connection and only the timers are worth overlaying. `interactive` accepts
// pointer events on the panels themselves (tabs, Decision 8); surfaces whose rows are actionable
// pass it, while non-interactive panels never intercept terminal input.
export function StatusPanels({ connections: connectionRows, schedule: scheduleRows, scheduleOnly = false, connectionsWindow, scheduleWindow, interactive = false, onCloseRow, canCloseRow, onOpenAcpTranscript, onOpenRow }: Properties) {
  const connectionList = scheduleOnly ? [] : connectionRows;
  const showConnections = connectionList.length > 0 && connectionsWindow.visible;
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
          {connectionList.map((c, index) => (
            <ConnectionRow key={index} row={c} index={index} onCloseRow={onCloseRow} canCloseRow={canCloseRow} onOpenAcpTranscript={onOpenAcpTranscript} onOpenRow={onOpenRow} />
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
