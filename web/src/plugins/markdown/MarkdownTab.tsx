import React, { useEffect, useRef, useState } from 'react';
import type { MarkdownPayload } from '@shared/plugins/markdown/shared';
import { renderMarkdown, type TabPluginClientCapabilities } from '../api';
import { onMarkdownKey } from './markdown-handlers';

// A markdown view tab body: a compact metadata header (name, size, location) above the rendered
// file, which fills and scrolls the remaining space. The text is fetched once, when the tab opens,
// so the view is a snapshot rather than a live mirror of the file.
//
// A plugin tab stays mounted while its tab is hidden, so the scroll keys bind only while
// `capabilities.active`: a markdown tab behind another tab, or in the other split pane, ignores them.
export function MarkdownTab({
  payload: markdown, capabilities,
}: { payload: MarkdownPayload; capabilities: TabPluginClientCapabilities }) {
  const [html, setHtml] = useState<string | undefined>(undefined);
  const stageRef = useRef<HTMLDivElement>(null);
  const source = capabilities.resourceUrl(markdown.url);
  const active = capabilities.active;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(source);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        if (!cancelled) setHtml(renderMarkdown(text) ?? text);
      } catch {
        if (!cancelled) setHtml(`<p>Failed to load ${markdown.name}</p>`);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [source, markdown.name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onMarkdownKey(e, stageRef.current);
    if (active) globalThis.addEventListener('keydown', onKey);
    return () => { if (active) globalThis.removeEventListener('keydown', onKey); };
  }, [active]);

  return (
    <div className="plugin-tab" data-doc-shot="markdown-view">
      <div className="plugin-meta">
        <span className="plugin-name">{markdown.name}</span>
        <span className="image-size">{markdown.size}</span>
        <span className="plugin-loc">{markdown.path}</span>
        {capabilities.splitAction && <span className="plugin-actions">{capabilities.splitAction}</span>}
      </div>
      {html === undefined
        ? <div className="markdown-stage" ref={stageRef} />
        : <div className="markdown-stage" ref={stageRef} dangerouslySetInnerHTML={{ __html: html }} />}
    </div>
  );
}
