import React, { useEffect, useRef } from 'react';
import type { MarkdownPayload } from '@shared/plugins/markdown/shared';
import type { TabPluginClientCapabilities } from '../api';
import { onMarkdownKey } from './markdown-handlers';
import { useMarkdownContent } from './useMarkdownContent';

// A markdown view tab body: a compact metadata header (name, size, location) above the rendered
// file, which fills and scrolls the remaining space. The text is fetched once, when the tab opens,
// so the view is a snapshot rather than a live mirror of the file.
//
// A plugin tab stays mounted while its tab is hidden, so the scroll keys bind only while
// `capabilities.active`: a markdown tab behind another tab, or in the other split pane, ignores them.
export function MarkdownTab({
  payload: markdown, capabilities,
}: { payload: MarkdownPayload; capabilities: TabPluginClientCapabilities }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const source = capabilities.resourceUrl(markdown.url);
  const active = capabilities.active;
  const content = useMarkdownContent(source);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onMarkdownKey(e, stageRef.current);
    if (active) globalThis.addEventListener('keydown', onKey);
    return () => { if (active) globalThis.removeEventListener('keydown', onKey); };
  }, [active]);

  const stage = content.status === 'loaded-html'
    ? <div className="markdown-stage" ref={stageRef} dangerouslySetInnerHTML={{ __html: content.html }} />
    : content.status === 'loaded-text'
      ? <div className="markdown-stage" ref={stageRef}>{content.text}</div>
      : content.status === 'failed'
        ? <div className="markdown-stage" ref={stageRef}>Failed to load {markdown.name}</div>
        : <div className="markdown-stage" ref={stageRef} />;

  return (
    <div className="plugin-tab" data-doc-shot="markdown-view">
      <div className="plugin-meta">
        <span className="plugin-name">{markdown.name}</span>
        <span className="plugin-size">{markdown.size}</span>
        <span className="plugin-loc">{markdown.path}</span>
        {capabilities.splitAction && <span className="plugin-actions">{capabilities.splitAction}</span>}
      </div>
      {stage}
    </div>
  );
}
