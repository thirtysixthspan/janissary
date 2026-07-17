import React from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { ImageTab } from './ImageTab';
import { MarkdownTab } from './MarkdownTab';
import { FileTreeTab } from './FileTreeTab';
import { NotificationsTab } from './NotificationsTab';
import { SchedulesTab } from './SchedulesTab';

// Renders the body for image, markdown, file-tree, and notifications view tabs. Harness, editor,
// and page tabs are rendered separately in App (via MountedViewLayers) because they must all stay
// mounted simultaneously — for xterm state, editor buffer, and embedded-page navigation
// preservation across tab switches; monitor tabs are reporting tabs, rendered in the
// ReportingSection below the command bar. `client`/`index` are used by the files branch to send
// its RPCs.
export function ViewTabBody({ tab, client, index, tabs = [] }: { tab: TabView; client: JanusClient; index: number; tabs?: TabView[] }) {
  const border = { borderLeft: `4px solid ${tab.dotColor}` };
  if (tab.view === 'image' && tab.image) {
    return <div className="tab-body" style={border}><ImageTab key={tab.image.url} image={tab.image} /></div>;
  }
  if (tab.view === 'markdown' && tab.markdown) {
    return <div className="tab-body" style={border}><MarkdownTab key={tab.markdown.url} markdown={tab.markdown} /></div>;
  }
  if (tab.view === 'files' && tab.files) {
    return <div className="tab-body" style={border}><FileTreeTab files={tab.files} client={client} index={index} /></div>;
  }
  if (tab.view === 'notifications') {
    return <div className="tab-body" style={border}><NotificationsTab lines={tab.bufferLines} client={client} index={index} /></div>;
  }
  if (tab.view === 'schedules') {
    return <div className="tab-body" style={border}><SchedulesTab entries={tab.aggregatedSchedules ?? []} tabs={tabs} client={client} index={index} /></div>;
  }
  return null;
}
