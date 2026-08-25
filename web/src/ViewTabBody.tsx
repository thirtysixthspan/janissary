import React from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { FileNavigatorTab } from './file-navigator/FileNavigatorTab';
import { NotificationsTab } from './NotificationsTab';
import { tabBodyBorder } from './tab-body-border';

// Renders the body for file navigator and notifications view tabs. Harness, editor, page, and
// plugin tabs are rendered separately in App (via MountedViewLayers) because they must all stay
// mounted simultaneously — for xterm state, editor buffer, embedded-page navigation, and video
// playback preservation across tab switches; monitor tabs are reporting tabs, rendered in the
// ReportingSection below the command bar. `client`/`index` are used by the files branch to send
// its RPCs.
export function ViewTabBody({
  tab, client, index, active = true, onSplit,
}: {
  tab: TabView; client: JanusClient; index: number;
  active?: boolean; onSplit?: () => void;
}) {
  const border = { borderLeft: tabBodyBorder(tab.dotColor, active) };
  if (tab.view === 'files' && tab.files) {
    return <div className="tab-body" style={border}><FileNavigatorTab files={tab.files} client={client} index={index} onSplit={onSplit} /></div>;
  }
  if (tab.view === 'notifications') {
    return <div className="tab-body" style={border}><NotificationsTab lines={tab.bufferLines} client={client} index={index} /></div>;
  }
  return null;
}
