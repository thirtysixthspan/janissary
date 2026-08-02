import React from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { ImageTab } from './ImageTab';
import { MarkdownTab } from './MarkdownTab';
import { FileNavigatorTab } from './FileNavigatorTab';
import { NotificationsTab } from './NotificationsTab';
import { SchedulesTab } from './SchedulesTab';
import { tabBodyBorder } from './tab-body-border';

// Renders the body for image, markdown, file navigator, and notifications view tabs. Harness, editor,
// page, and video tabs are rendered separately in App (via MountedViewLayers) because they must all stay
// mounted simultaneously — for xterm state, editor buffer, embedded-page navigation, and video
// playback preservation across tab switches; monitor tabs are reporting tabs, rendered in the
// ReportingSection below the command bar. `client`/`index` are used by the files branch to send
// its RPCs.
export function ViewTabBody({
  tab, client, index, tabs = [], active = true, onSplit,
}: {
  tab: TabView; client: JanusClient; index: number; tabs?: TabView[];
  active?: boolean; onSplit?: () => void;
}) {
  const border = { borderLeft: tabBodyBorder(tab.dotColor, active) };
  if (tab.view === 'image' && tab.image) {
    return <div className="tab-body" style={border}><ImageTab key={tab.image.url} image={tab.image} active={active} onSplit={onSplit} /></div>;
  }
  if (tab.view === 'markdown' && tab.markdown) {
    return <div className="tab-body" style={border}><MarkdownTab key={tab.markdown.url} markdown={tab.markdown} active={active} onSplit={onSplit} /></div>;
  }
  if (tab.view === 'files' && tab.files) {
    return <div className="tab-body" style={border}><FileNavigatorTab files={tab.files} client={client} index={index} onSplit={onSplit} /></div>;
  }
  if (tab.view === 'notifications') {
    return <div className="tab-body" style={border}><NotificationsTab lines={tab.bufferLines} client={client} index={index} /></div>;
  }
  if (tab.view === 'schedules') {
    return <div className="tab-body" style={border}><SchedulesTab entries={tab.aggregatedSchedules ?? []} tabs={tabs} client={client} index={index} onSplit={onSplit} /></div>;
  }
  return null;
}
