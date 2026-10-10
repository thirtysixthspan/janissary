import { useEffect, useState } from 'react';
import { renderMarkdown } from '../api';
import { loadMarkdownSource } from './markdown-source';

export type MarkdownContent =
  | { status: 'loading' }
  | { status: 'loaded-html'; html: string }
  | { status: 'loaded-text'; text: string }
  | { status: 'failed' };

type ContentSnapshot = { source: string; content: MarkdownContent };

export function useMarkdownContent(source: string): MarkdownContent {
  const [snapshot, setSnapshot] = useState<ContentSnapshot>({ source, content: { status: 'loading' } });

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot({ source, content: { status: 'loading' } });
    void loadMarkdownSource(source, controller.signal).then((text) => {
      if (controller.signal.aborted) return;
      const html = renderMarkdown(text);
      const content: MarkdownContent = html === undefined
        ? { status: 'loaded-text', text }
        : { status: 'loaded-html', html };
      setSnapshot({ source, content });
    }).catch(() => {
      if (!controller.signal.aborted) setSnapshot({ source, content: { status: 'failed' } });
    });
    return () => { controller.abort(); };
  }, [source]);

  return snapshot.source === source ? snapshot.content : { status: 'loading' };
}
