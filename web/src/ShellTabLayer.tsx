import React from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { ShellTab } from './ShellTab';
import type { ShellTabHandle } from './tab-handles';
import { tabBodyBorder } from './tab-body-border';

type Properties = {
  tabs: TabView[];
  activeLabel: string;
  visibleLabels?: string[];
  client: JanusClient;
  onHandle: (ptyId: string, handle: ShellTabHandle | null) => void;
  onSplit?: (index: number) => void;
};

// Persistent layer of full-tab shell PTYs. All agent tabs with a running interactive PTY stay
// mounted (only the active one visible) so xterm state is preserved across tab switches.
export function ShellTabLayer({
  tabs, activeLabel, visibleLabels = [activeLabel], client, onHandle, onSplit,
}: Properties) {
  return (
    <>
      {tabs.map((tab, index) => ({ tab, index })).filter(({ tab }) => !tab.view && tab.activePty).map(({ tab: t, index }) => (
        <div
          key={t.activePty}
          className="tab-body"
          data-pane-index={index}
          style={{
            borderLeft: tabBodyBorder(t.dotColor, t.label === activeLabel),
            display: visibleLabels.includes(t.label) ? 'flex' : 'none',
            gridColumn: t.pane === 'right' ? 2 : 1,
            gridRow: 2,
          }}
        >
          <ShellTab ptyId={t.activePty!} client={client} cwd={t.cwd} flags={t.flags}
            onSplit={onSplit ? () => onSplit(index) : undefined}
            ref={(h) => onHandle(t.activePty!, h)} />
        </div>
      ))}
    </>
  );
}
