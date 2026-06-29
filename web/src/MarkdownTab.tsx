import React, { useEffect, useRef, useState } from 'react';
import type { MarkdownView } from '@shared/protocol';
import { renderMarkdown } from './markdown';

const LINE_STEP = 40;

export function MarkdownTab({ markdown }: { markdown: MarkdownView }) {
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
    const onKey = (e: KeyboardEvent) => {
      const stage = stageRef.current;
      if (!stage) return;
      switch (e.key) {
        case 'ArrowUp': {
          e.preventDefault();
          stage.scrollTop -= LINE_STEP;
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          stage.scrollTop += LINE_STEP;
          break;
        }
        case 'PageUp': {
          e.preventDefault();
          stage.scrollTop -= stage.clientHeight;
          break;
        }
        case 'PageDown': {
          e.preventDefault();
          stage.scrollTop += stage.clientHeight;
          break;
        }
        // No default
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => { globalThis.removeEventListener('keydown', onKey); };
  }, []);

  return (
    <div className="image-tab">
      <div className="image-meta">
        <span className="image-name">{markdown.name}</span>
        <span className="image-size">{markdown.size}</span>
        <span className="image-loc">{markdown.path}</span>
      </div>
      {html === undefined
        ? <div className="markdown-stage" ref={stageRef} />
        : <div className="markdown-stage" ref={stageRef} dangerouslySetInnerHTML={{ __html: html }} />}
    </div>
  );
}
