import React, { useRef } from 'react';
import type { PageView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { usePageContentSync } from './page/usePageContentSync';

export function PageTab({ page, closeTab, index, client }: { page: PageView; closeTab: (index: number) => void; index: number; client: JanusClient }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  usePageContentSync(iframeRef, page.url, client);
  return (
    <div className="page-tab" data-doc-shot="page-view">
      <div className="page-header">
        <div className="page-meta">
          <span className="page-url">{page.url}</span>
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
        ref={iframeRef}
        className="page-frame"
        src={page.url}
        title={page.domain}
      />
    </div>
  );
}
