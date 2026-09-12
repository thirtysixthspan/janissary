import { useCallback, useEffect, useRef, useState } from 'react';
import type { PdfLoadFailure } from '@shared/plugins/pdf/shared';
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
): PdfDocumentState & { onRenderFailure(): void } {
  const [state, setState] = useState<PdfDocumentState>({ status: 'loading' });
  const reported = useRef(false);
  const intent = useRef(capabilities.intent);

  useEffect(() => { intent.current = capabilities.intent; }, [capabilities.intent]);

  const fail = useCallback((reason: PdfLoadFailure) => {
    setState({ status: 'failed' });
    if (reported.current) return;
    reported.current = true;
    void intent.current('load-failed', { reason }).catch(() => {});
  }, []);
  const onRenderFailure = useCallback(() => { fail('other'); }, [fail]);

  useEffect(() => {
    let live = true;
    let loaded: LoadedPdf | null = null;
    const controller = new AbortController();

    void loadPdf(url, controller.signal).then((result) => {
      if (result.ok) {
        if (!live) { result.document.destroy(); return; }
        loaded = result.document;
        setState({ status: 'ready', document: result.document });
        return;
      }
      if (!live) return;
      fail(result.reason);
    });

    return () => { live = false; controller.abort(); loaded?.destroy(); };
  }, [fail, url]);

  return { ...state, onRenderFailure };
}
