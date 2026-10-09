import React from 'react';
import type { DiffLine } from '@shared/plugins/diff/shared';
import type { TokenRange } from '../api';
import { UnifiedCodeLine } from './UnifiedCodeLine';
import { useLineComment } from './useLineComment';
import { LineCommentPanel } from './LineCommentPanel';

export function UnifiedLine({ line, tokens, spans, onOpenLine }: {
  line: DiffLine;
  tokens: TokenRange[];
  spans: { from: number; to: number }[] | undefined;
  onOpenLine(line: DiffLine): void;
}) {
  const review = useLineComment(line);
  const originalReview = useLineComment(line, 'original');
  const label = `${review.note ? 'Edit' : 'Add'} comment on ${review.label}`;
  return (
    <div className="diff-unified-row">
      <UnifiedCodeLine line={line} tokens={tokens} spans={spans} label={label} onOpenLine={onOpenLine} onAdd={review.start} />
      <LineCommentPanel review={review} />
      {line.kind === 'context' && <LineCommentPanel review={originalReview} />}
    </div>
  );
}
