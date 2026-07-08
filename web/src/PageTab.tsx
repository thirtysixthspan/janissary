import React from 'react';
import type { PageView } from '@shared/protocol';
import type { JanusClient } from './ws';

export function PageTab({ page, client, index }: { page: PageView; client: JanusClient; index: number }) {
  return (
    <div className="page-tab" data-doc-shot="page-view">
      <div className="page-header">
        <div className="page-meta">
          <span className="page-number">{page.number})</span>
          <span className="page-domain">{page.domain}</span>
          <span className="page-url">{page.url}</span>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="page-close"
            title="Close"
            aria-label="Close tab"
            onClick={() => client.send({ method: 'closeTab', params: { index } })}
          >
            ×
          </button>
        </div>
      </div>
      <iframe
        className="page-frame"
        src={page.url}
        title={`${page.number}) ${page.domain}`}
      />
    </div>
  );
}
