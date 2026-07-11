import React, { useRef } from 'react';
import type { BufferLine } from '@shared/protocol';
import type { JanusClient } from './ws';
import { Transcript } from './Transcript';
import { nextDock, dockTooltip } from './dock-cycle';

type Properties = {
  lines: BufferLine[];
  client: JanusClient;
  index: number;
  // Current dock location (undefined means center). The dock-cycle button renders only
  // while docked, matching FileTreeTab.
  dock?: 'left' | 'right';
};

// A read-only notification feed: the standard transcript with no command bar. A notification has
// no tool steps or clickable prompts, so the collapse and prompt-click handlers are no-ops.
const noop = () => {};

export function NotificationsTab({ lines, client, index, dock }: Properties) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <div className="notifications-tab">
      {dock && (
        <div className="notifications-header">
          <div className="notifications-actions">
            <button
              type="button"
              className="notifications-dock-cycle"
              title={dockTooltip(nextDock(dock))}
              onClick={() => client.send({ method: 'setDock', params: { index, dock: nextDock(dock) } })}
            >
              ⇄
            </button>
          </div>
        </div>
      )}
      <Transcript
        lines={lines.toReversed()}
        client={client}
        onToggleCollapse={noop}
        onPromptClick={noop}
        scrollRef={scrollRef}
        showEmptyHint={false}
        pinToBottom={false}
      />
    </div>
  );
}
