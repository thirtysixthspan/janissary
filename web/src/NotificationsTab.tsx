import React, { useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { BufferLine } from '@shared/protocol';
import type { JanusClient } from './ws';
import { Transcript } from './Transcript';
import { nextDock, dockTooltip } from './dock-cycle';
import { dockSwapIcon } from './icons';
import { onNotificationsKey } from './notifications-handlers';

// The keys the feed scrolls on; they are kept from reaching the window-level bindings.
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown']);

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
  // Scroll the feed from the keyboard while it holds focus (click or tab to focus it). Handled
  // per-element rather than globally so a docked feed never steals arrows from another active tab.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!SCROLL_KEYS.has(e.key)) return;
    e.stopPropagation();
    onNotificationsKey(e.nativeEvent, scrollRef.current);
  };
  return (
    <div className="notifications-tab" tabIndex={0} onKeyDown={onKeyDown}>
      {dock && (
        <div className="notifications-header">
          <div className="notifications-actions">
            <button
              type="button"
              className="notifications-dock-cycle"
              title={dockTooltip(nextDock(dock))}
              onClick={() => client.send({ method: 'setDock', params: { index, dock: nextDock(dock) } })}
            >
              <FontAwesomeIcon icon={dockSwapIcon} />
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
