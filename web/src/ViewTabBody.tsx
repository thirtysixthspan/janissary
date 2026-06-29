import React from 'react';
import type { TabView } from '@shared/protocol';
import { ImageTab } from './ImageTab';
import { MarkdownTab } from './MarkdownTab';
import { PageTab } from './PageTab';

// Renders the body for image, page, and markdown view tabs. Harness tabs are rendered separately
// in App because they must all stay mounted simultaneously for xterm state preservation.
export function ViewTabBody({ tab }: { tab: TabView }) {
  const border = { borderLeft: `4px solid ${tab.dotColor}` };
  if (tab.view === 'image' && tab.image) {
    return <div className="tab-body" style={border}><ImageTab key={tab.image.url} image={tab.image} /></div>;
  }
  if (tab.view === 'page' && tab.page) {
    return <div className="tab-body" style={border}><PageTab page={tab.page} /></div>;
  }
  if (tab.view === 'markdown' && tab.markdown) {
    return <div className="tab-body" style={border}><MarkdownTab key={tab.markdown.url} markdown={tab.markdown} /></div>;
  }
  return null;
}
