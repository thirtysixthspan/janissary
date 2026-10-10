import React from 'react';
import type { FileLinkSegment } from './file-link';
import type { TranscriptIntents } from './transcript-intents';

export function renderFileLinkSegments(
  segments: FileLinkSegment[],
  intents: TranscriptIntents,
): React.ReactNode[] {
  return segments.map((seg, i) => {
    if (seg.type === 'text') {
      return seg.content || null;
    }
    const isUrl = seg.type === 'url';
    return React.createElement(
      'span',
      {
        key: i,
        className: 'file-link',
        title: `${seg.fullMatch} — click to open`,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          if (isUrl) intents.onOpenFile(seg.url);
          else intents.onEditFile(`${seg.path}:${seg.line}`);
        },
      },
      seg.fullMatch,
    );
  });
}
