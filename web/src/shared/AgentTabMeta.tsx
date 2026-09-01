import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { tabFlagDisplay } from './tab-flag-display';
import { openFilesIcon, newTabIcon, viewCaptureIcon, connectionsWindowIcon, scheduleWindowIcon } from '../icons';
import { StatusWindowButton } from '../StatusWindowButton';
import { SplitTabButton } from '../SplitTabButton';
import type { StatusWindowButtonProps } from '../status-button';
import type { RemoteTarget } from '@shared/protocol';
import { RemoteChip } from './RemoteChip';

type Properties = {
  cwd?: string; flags?: string[]; model?: string; effort?: string; remote?: RemoteTarget;
  onOpenFileNavigator?: () => void; onLaunchAgentHere?: () => void; onOpenTranscript?: () => void;
  connectionsButton?: StatusWindowButtonProps; scheduleButton?: StatusWindowButtonProps;
  onSplit?: () => void;
};

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="tab-meta-chip" aria-label={label} title={`${label}: ${value}`}>
      {value}
    </span>
  );
}

export function AgentTabMeta({
  cwd, flags, model, effort, remote, onOpenFileNavigator, onLaunchAgentHere, onOpenTranscript,
  connectionsButton, scheduleButton, onSplit,
}: Properties) {
  const workspaced = flags?.includes('workspaced') ?? false;
  return (
    <div className="tab-meta">
      {remote !== undefined && <RemoteChip remote={remote} />}
      <span className="tab-cwd">{cwd}</span>
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
      </span>
    </div>
  );
}
