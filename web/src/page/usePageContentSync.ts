import { useEffect } from 'react';
import type { JanusClient } from '../ws';

// The marker the bundled extension's content script tags its postMessage payloads with — must
// match `chrome-extension/content-script.js`'s `SOURCE` constant.
const SOURCE = 'janissary-page-content';

// Relays the embedded page's visible-text snapshots (posted by the extension content script) to
// the server as transient page state, so a monitor watching this page tab can see them. Only
// messages whose `event.source` is this exact iframe's content window are accepted — an embedded
// page is cross-origin and untrusted, so origin alone can't identify it, but the iframe's window
// object can.
export function usePageContentSync(iframeRef: React.RefObject<HTMLIFrameElement | null>, url: string, client: JanusClient): void {
  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data: unknown = event.data;
      if (!data || typeof data !== 'object') return;
      const { source, text } = data as { source?: unknown; text?: unknown };
      if (source !== SOURCE || typeof text !== 'string') return;
      client.pageSync(url, text);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [iframeRef, url, client]);
}
