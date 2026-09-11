import { useEffect, useRef, useState } from 'react';
import type { TabPluginClientCapabilities } from '../api';
import { loadPdf, type LoadedPdf } from './pdf-document';

export type PdfDocumentState =
  | { status: 'loading' }
  | { status: 'ready'; document: LoadedPdf }
  | { status: 'failed' };

// Bridges the loader to the view. A failed load shows in the body and additionally reports one line
// to the notifications feed, because the tab body is not always on screen — but only once per tab,
// so a re-render can never spam the feed.
//
// The host builds a fresh capability object on every render, so the intent is reached through a ref
// rather than an effect dependency: keying the load on `capabilities` would reload the document on
// every render of the tab.
export function usePdfDocument(
  url: string, capabilities: TabPluginClientCapabilities,
): PdfDocumentState {
  const [state, setState] = useState<PdfDocumentState>({ status: 'loading' });
  const reported = useRef(false);
  const intent = useRef(capabilities.intent);

  useEffect(() => { intent.current = capabilities.intent; }, [capabilities.intent]);

  useEffect(() => {
    let live = true;
    let loaded: LoadedPdf | null = null;

    void loadPdf(url).then((result) => {
      if (result.ok) {
        if (!live) { result.document.destroy(); return; }
        loaded = result.document;
        setState({ status: 'ready', document: result.document });
        return;
      }
      if (!live) return;
      setState({ status: 'failed' });
      if (reported.current) return;
      reported.current = true;
      // Nothing is waiting on the answer: the body already says the document failed, and the feed
      // line is the server's to write.
      void intent.current('load-failed', { reason: result.reason }).catch(() => {});
    });

    return () => { live = false; loaded?.destroy(); };
  }, [url]);

  return state;
}
