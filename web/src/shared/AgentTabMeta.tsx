import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { tabFlagDisplay } from './tab-flag-display';
import { openFilesIcon, newTabIcon, viewCaptureIcon, connectionsWindowIcon, scheduleWindowIcon } from '../icons';
import { StatusWindowButton } from './status-windows/StatusWindowButton';
import { SplitTabButton } from '../SplitTabButton';
import type { StatusWindowButtonProps } from './status-windows/status-button';
import type { RemoteTargetView } from '@shared/protocol';
import { RemoteChip } from './RemoteChip';
import { ConnectionPlug } from './ConnectionPlug';
import { RemoteSessionButton, type RemoteSessionState } from './RemoteSessionButton';

type Properties = {
  cwd?: string; cwdDisplay?: string; flags?: string[]; model?: string; effort?: string; remote?: RemoteTargetView;
  onOpenFileNavigator?: () => void; onLaunchAgentHere?: () => void; onOpenTranscript?: () => void;
  connectionsButton?: StatusWindowButtonProps; scheduleButton?: StatusWindowButtonProps;
  onSplit?: () => void;
  // Set only for a remote tab: what its channel is doing, and where to send the detach or reattach
  // the control raises. Whether an action is in flight is the button's own business — nothing out
  // here knows it, so nothing out here is asked for it.
  remoteSession?: {
    state: RemoteSessionState;
    onAction(action: 'detach' | 'reattach'): void;
  };
};

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="tab-meta-chip" aria-label={label} title={`${label}: ${value}`}>
      {value}
    </span>
  );
}

export function AgentTabMeta({
  cwd, cwdDisplay, flags, model, effort, remote, onOpenFileNavigator, onLaunchAgentHere, onOpenTranscript,
  connectionsButton, scheduleButton, onSplit, remoteSession,
}: Properties) {
  const workspaced = flags?.includes('workspaced') ?? false;
  return (
    <div className="tab-meta">
      {remote !== undefined && remoteSession !== undefined && (
        <ConnectionPlug state={remoteSession.state} />
      )}
      {remote !== undefined && <RemoteChip remote={remote} />}
      <span className="tab-cwd">{cwdDisplay ?? cwd}</span>
      {model !== undefined && <MetaChip label="Model" value={model} />}
      {effort !== undefined && <MetaChip label="Effort" value={effort} />}
      <span className="tab-flags">
        {(flags ?? []).map((flag) => {
          const display = tabFlagDisplay[flag];
          if (!display) return null;
          return (
            <span key={flag} className="tab-flag" role="img" aria-label={display.label} title={display.label}>
              <FontAwesomeIcon icon={display.icon} />
            </span>
          );
        })}
      </span>
      <span className="tab-meta-actions">
        {onOpenFileNavigator && (
          <button
            type="button"
            className="tab-open-files"
            title={workspaced ? 'Open file navigator in this workspace' : 'Open file navigator here'}
            onClick={onOpenFileNavigator}
          >
            <FontAwesomeIcon icon={openFilesIcon} />
          </button>
        )}
        {onLaunchAgentHere && (
          <button
            type="button"
            className="tab-launch-agent"
            title={workspaced ? 'New agent in this workspace' : 'New agent here'}
            onClick={onLaunchAgentHere}
          >
            <FontAwesomeIcon icon={newTabIcon} />
          </button>
        )}
        {onOpenTranscript && (
          <button
            type="button"
            className="tab-open-transcript"
            title="Open transcript"
            aria-label="Open transcript"
            onClick={onOpenTranscript}
          >
            <FontAwesomeIcon icon={viewCaptureIcon} />
          </button>
        )}
        {connectionsButton && (
          <StatusWindowButton
            icon={connectionsWindowIcon}
            className="tab-connections"
            hasContent={connectionsButton.hasContent}
            activeTitle="connections"
            emptyTitle="no active connections"
            onEnter={connectionsButton.onEnter}
            onLeave={connectionsButton.onLeave}
            onClick={connectionsButton.onClick}
          />
        )}
        {scheduleButton && (
          <StatusWindowButton
            icon={scheduleWindowIcon}
            className="tab-schedule"
            hasContent={scheduleButton.hasContent}
            activeTitle="schedule"
            emptyTitle="no active schedules"
            onEnter={scheduleButton.onEnter}
            onLeave={scheduleButton.onLeave}
            onClick={scheduleButton.onClick}
          />
        )}
        {onSplit && <SplitTabButton onClick={onSplit} />}
        {remote !== undefined && remoteSession !== undefined && (
          <RemoteSessionButton
            state={remoteSession.state}
            host={remote.host}
            onAction={remoteSession.onAction}
          />
        )}
      </span>
    </div>
  );
}
