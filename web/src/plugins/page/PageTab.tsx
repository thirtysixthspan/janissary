import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faArrowRight, faRotateRight } from '@fortawesome/free-solid-svg-icons';
import type { PagePayload } from '@shared/plugins/page/shared';
import type { TabPluginClientCapabilities } from '../api';
import { usePageContentSync } from './usePageContentSync';
import { PageAddressInput } from './PageAddressInput';

// The embedded web page tab body: a compact metadata header (address, navigation, split, close)
// above an iframe filling the rest of the tab. The app neither scripts nor reads the embedded page;
// everything below either drives the iframe's own history or relays what the bundled extension's
// content script volunteers.
export function PageTab({
  payload: page, capabilities,
}: { payload: PagePayload; capabilities: TabPluginClientCapabilities }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const cancelledRef = useRef(false);
  const active = capabilities.active;
  const close = capabilities.close;

  // A tab-scoped intent is fire-and-forget here: the server answers by replacing this tab's payload,
  // so there is no result to await and a refused request must not surface as an unhandled rejection.
  const send = useCallback((intent: string, payload: unknown) => {
    void capabilities.intent(intent, payload).catch(() => {});
  }, [capabilities]);
  const sync = useCallback((url: string, text: string) => { send('sync', { url, text }); }, [send]);
  const navigate = useCallback((url: string) => { send('navigate', { url }); }, [send]);
  usePageContentSync(iframeRef, page.url, sync);

  // Keyboard events inside a cross-origin iframe never reach the host's window listener, so Cmd+W
  // would close the browser window instead of this tab. The browser-level close is intercepted here
  // and turned back into closing the tab the shortcut was aimed at.
  useEffect(() => {
    if (!active) return;
    let reEntryGuard = false;
    const onBeforeUnload = (e: Event) => {
      if (reEntryGuard) return;
      reEntryGuard = true;
      e.preventDefault();
      close();
    };
    globalThis.addEventListener('beforeunload', onBeforeUnload);
    return () => globalThis.removeEventListener('beforeunload', onBeforeUnload);
  }, [active, close]);

  const goBack = () => iframeRef.current?.contentWindow?.history.back();
  const goForward = () => iframeRef.current?.contentWindow?.history.forward();
  const reload = () => setReloadNonce((n) => n + 1);

  const startEdit = () => { cancelledRef.current = false; setDraft(page.url); setEditing(true); };
  const commit = () => {
    if (cancelledRef.current) return;
    setEditing(false);
    const target = draft.trim();
    if (target && target !== page.url) navigate(target);
  };
  const cancel = () => { cancelledRef.current = true; setEditing(false); };

  return (
    <div className="page-tab" data-doc-shot="page-view">
      <div className="page-header">
        <div className="page-meta">
          {editing ? (
            <PageAddressInput value={draft} onChange={setDraft} onCommit={commit} onCancel={cancel} />
          ) : (
            <span className="page-url" onDoubleClick={startEdit}>{page.url}</span>
          )}
        </div>
        <div className="page-actions">
          <div className="page-nav">
            <button type="button" className="page-back" title="Back" aria-label="Back" onClick={goBack}>
              <FontAwesomeIcon icon={faArrowLeft} />
            </button>
            <button type="button" className="page-forward" title="Forward" aria-label="Forward" onClick={goForward}>
              <FontAwesomeIcon icon={faArrowRight} />
            </button>
            <button type="button" className="page-reload" title="Reload" aria-label="Reload" onClick={reload}>
              <FontAwesomeIcon icon={faRotateRight} />
            </button>
          </div>
          {capabilities.splitAction}
          <button
            type="button"
            className="page-close"
            title="Close"
            aria-label="Close tab"
            onClick={close}
          >
            ×
          </button>
        </div>
      </div>
      {/* Keyed on the address as well as the reload nonce, so navigating loads the new address into
          a fresh frame rather than leaving the old document's history behind it. */}
      <iframe
        key={`${page.url}:${reloadNonce}`}
        ref={iframeRef}
        className="page-frame"
        src={page.url}
        title={page.domain}
      />
      {!active && <div className="page-focus-catcher" aria-label={`Focus ${page.domain}`} />}
    </div>
  );
}
