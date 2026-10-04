import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  StatusPanels, StatusWindowButton, connectionsWindowIcon, newTabIcon, openFilesIcon, scheduleWindowIcon,
  statusButton, useStatusWindows, workspacedIcon,
  type TabPluginClientCapabilities,
} from '../api';
import type { ShellPayload } from '@shared/plugins/shell/shared';

// The shell tab's own metadata row.
//
// Written here rather than imported from the host's `AgentTabMeta`, which is the self-contained choice
// this plugin was built for: the same structure and the same class names, so it looks identical, with
// the actions supplied by declared capabilities rather than borrowed markup. The control it omits is
// **Open transcript**, which would open nothing — the terminal replaced the transcript, so there is no
// longer one to open.
export function ShellTabMeta({ payload, capabilities }: {
  payload: ShellPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  // The tab's own label, which is what the hook re-arms on: two shell tabs each get their own
  // auto-show, and returning to this one shows its connections panel again as an agent tab's would.
  // The fallback is what a host that reports no label would get — one identity for every shell tab, so
  // the auto-show fires on mount rather than on each activation.
  const windows = useStatusWindows(capabilities.label ?? 'shell');
  return (
    <>
      <div className="tab-meta">
        <span className="tab-cwd">{payload.cwd}</span>
        <span className="tab-flags">
          {payload.workspace && (
            <span className="tab-flag tab-flag--active" role="img" aria-label="Workspaced" title="Workspaced">
              <FontAwesomeIcon icon={workspacedIcon} />
            </span>
          )}
        </span>
        <span className="tab-meta-actions">
          <button
            type="button"
            className="tab-open-files"
            title={payload.workspace ? 'Open file navigator in this workspace' : 'Open file navigator here'}
            onClick={() => capabilities.openFileNavigator?.()}
          >
            <FontAwesomeIcon icon={openFilesIcon} />
          </button>
          <button
            type="button"
            className="tab-launch-agent"
            title={payload.workspace ? 'New agent in this workspace' : 'New agent here'}
            onClick={() => capabilities.launchAgentHere?.()}
          >
            <FontAwesomeIcon icon={newTabIcon} />
          </button>
          {/* The two status windows, and the buttons that open them. Rendering the panels without these
              is how the host pushed rows into this payload that nothing could ever show: the shell does
              own a connection — its own zsh — so the window has something true to list. */}
          <StatusWindowButton
            icon={connectionsWindowIcon}
            className="tab-connections"
            activeTitle="connections"
            emptyTitle="no active connections"
            {...statusButton(payload.connections.length > 0, windows.connections)}
          />
          <StatusWindowButton
            icon={scheduleWindowIcon}
            className="tab-schedule"
            activeTitle="schedule"
            emptyTitle="no active schedules"
            {...statusButton(payload.schedule.length > 0, windows.schedule)}
          />
          {capabilities.splitAction}
        </span>
      </div>
      <StatusPanels
        connections={payload.connections}
        schedule={payload.schedule}
        connectionsWindow={windows.connections}
        scheduleWindow={windows.schedule}
        interactive
      />
    </>
  );
}

