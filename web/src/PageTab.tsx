import React from 'react';
import type { PageView } from '@shared/protocol';

export function PageTab({ page, closeTab, index }: { page: PageView; closeTab: (index: number) => void; index: number }) {
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
        className="page-frame"
        src={page.url}
        title={page.domain}
      />
    </div>
  );
}
