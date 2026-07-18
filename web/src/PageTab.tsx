import React, { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { PageView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { usePageContentSync } from './page/usePageContentSync';
import { pageBackIcon, pageForwardIcon, pageReloadIcon } from './icons';

export function PageTab({ page, closeTab, index, client }: { page: PageView; closeTab: (index: number) => void; index: number; client: JanusClient }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const cancelledRef = useRef(false);
  usePageContentSync(iframeRef, page.url, client);

  const goBack = () => iframeRef.current?.contentWindow?.history.back();
  const goForward = () => iframeRef.current?.contentWindow?.history.forward();
  const reload = () => setReloadNonce((n) => n + 1);

  const startEdit = () => { cancelledRef.current = false; setDraft(page.url); setEditing(true); };
  const commit = () => {
    if (cancelledRef.current) return;
    setEditing(false);
    const target = draft.trim();
    if (target && target !== page.url) client.navigatePage(index, target);
  };
  const cancel = () => { cancelledRef.current = true; setEditing(false); };

  return (
    <div className="page-tab" data-doc-shot="page-view">
      <div className="page-header">
        <div className="page-meta">
          <div className="page-nav">
            <button type="button" className="page-back" title="Back" aria-label="Back" onClick={goBack}>
              <FontAwesomeIcon icon={pageBackIcon} />
            </button>
            <button type="button" className="page-forward" title="Forward" aria-label="Forward" onClick={goForward}>
              <FontAwesomeIcon icon={pageForwardIcon} />
            </button>
            <button type="button" className="page-reload" title="Reload" aria-label="Reload" onClick={reload}>
              <FontAwesomeIcon icon={pageReloadIcon} />
            </button>
          </div>
          {editing ? (
            <input
              className="page-url-input"
              value={draft}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.currentTarget.blur(); }
                else if (e.key === 'Escape') { cancel(); }
              }}
            />
          ) : (
            <span className="page-url" onDoubleClick={startEdit}>{page.url}</span>
          )}
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="page-close"
            title="Close"
            aria-label="Close tab"
            onClick={() => closeTab(index)}
          >
            ×
          </button>
        </div>
      </div>
      <iframe
        key={reloadNonce}
        ref={iframeRef}
        className="page-frame"
        src={page.url}
        title={page.domain}
      />
    </div>
  );
}
