import React, { useEffect, useRef, useState } from 'react';
import type { MarkdownView } from '@shared/protocol';
import { renderMarkdown } from './markdown';
import { onMarkdownKey } from './markdown-handlers';
import { SplitTabButton } from './SplitTabButton';

export function MarkdownTab({
  markdown, active = true, onSplit,
}: { markdown: MarkdownView; active?: boolean; onSplit?: () => void }) {
  const [html, setHtml] = useState<string | undefined>(undefined);
  const stageRef = useRef<HTMLDivElement>(null);
  const token = new URLSearchParams(location.search).get('token') ?? '';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`${markdown.url}?token=${encodeURIComponent(token)}`);
        const text = await r.text();
        if (!cancelled) setHtml(renderMarkdown(text) ?? text);
      } catch {
        if (!cancelled) setHtml(`<p>Failed to load ${markdown.name}</p>`);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [markdown.url, markdown.name, token]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onMarkdownKey(e, stageRef.current);
    if (active) globalThis.addEventListener('keydown', onKey);
    return () => { if (active) globalThis.removeEventListener('keydown', onKey); };
  }, [active]);

  return (
    <div className="image-tab" data-doc-shot="markdown-view">
      <div className="image-meta">
        <span className="image-name">{markdown.name}</span>
        <span className="image-size">{markdown.size}</span>
        <span className="image-loc">{markdown.path}</span>
        {onSplit && <SplitTabButton onClick={onSplit} />}
      </div>
      {html === undefined
        ? <div className="markdown-stage" ref={stageRef} />
        : <div className="markdown-stage" ref={stageRef} dangerouslySetInnerHTML={{ __html: html }} />}
    </div>
  );
}
