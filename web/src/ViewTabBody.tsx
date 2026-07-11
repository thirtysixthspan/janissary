import React from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { ImageTab } from './ImageTab';
import { MarkdownTab } from './MarkdownTab';
import { PageTab } from './PageTab';
import { FileTreeTab } from './FileTreeTab';
import { NotificationsTab } from './NotificationsTab';

// Renders the body for image, page, markdown, file-tree, and notifications view tabs. Harness tabs are rendered
// separately in App because they must all stay mounted simultaneously for xterm state
// preservation; monitor tabs are reporting tabs, rendered in the ReportingSection below the
// command bar. `client`/`index` are used by the page and files branches, to send their RPCs;
// `closeTab` is the app-level guarded close (last-tab quit check, unsaved-editor guard) the page
// branch's own close button must go through instead of closing the tab directly.
export function ViewTabBody({ tab, client, index, closeTab }: { tab: TabView; client: JanusClient; index: number; closeTab: (index: number) => void }) {
  const border = { borderLeft: `4px solid ${tab.dotColor}` };
  if (tab.view === 'image' && tab.image) {
    return <div className="tab-body" style={border}><ImageTab key={tab.image.url} image={tab.image} /></div>;
  }
  if (tab.view === 'page' && tab.page) {
    return <div className="tab-body" style={border}><PageTab page={tab.page} closeTab={closeTab} index={index} /></div>;
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
  return null;
}
