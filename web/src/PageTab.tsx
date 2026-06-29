import React from 'react';
import type { PageView } from '@shared/protocol';

export function PageTab({ page }: { page: PageView }) {
  return (
    <div className="page-tab">
      <iframe
        className="page-frame"
        src={page.url}
        title={`${page.number}) ${page.domain}`}
      />
    </div>
  );
}
