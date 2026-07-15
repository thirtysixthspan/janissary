import React from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { ShellTab, type ShellTabHandle } from './ShellTab';

type Properties = {
  tabs: TabView[];
  activeLabel: string;
  client: JanusClient;
  onHandle: (ptyId: string, handle: ShellTabHandle | null) => void;
};

// Persistent layer of full-tab shell PTYs. All agent tabs with a running interactive PTY stay
// mounted (only the active one visible) so xterm state is preserved across tab switches.
export function ShellTabLayer({ tabs, activeLabel, client, onHandle }: Properties) {
  return (
    <>
      {tabs.filter((t) => !t.view && t.activePty).map((t) => (
        <div
          key={t.activePty}
          className="tab-body"
          style={{ borderLeft: `4px solid ${t.dotColor}`, display: t.label === activeLabel ? 'flex' : 'none' }}
        >
          <ShellTab ptyId={t.activePty!} client={client} cwd={t.cwd} flags={t.flags}
            ref={(h) => onHandle(t.activePty!, h)} />
        </div>
      ))}
    </>
  );
}
