import React from 'react';
import type { DiffLine } from '@shared/plugins/diff/shared';
import type { TokenRange } from '../api';
import { ChangedText } from './ChangedText';
import { markerOf } from './line-marker';

export const UnifiedCodeLine = React.memo(function UnifiedCodeLine({ line, tokens, spans, label, onOpenLine, onAdd }: {
  line: DiffLine;
  tokens: TokenRange[];
  spans: { from: number; to: number }[] | undefined;
  label: string;
  onOpenLine(line: DiffLine): void;
  onAdd(): void;
}) {
  return (
    <div className={`diff-line diff-${line.kind}`} onDoubleClick={line.kind === 'removed' ? undefined : () => onOpenLine(line)}>
      <span className="diff-number">{line.oldNumber ?? ''}</span>
      <span className="diff-number">{line.kind === 'removed' ? '' : line.number}</span>
      <span className="diff-marker">{markerOf(line.kind)}</span>
      <ChangedText line={line} tokens={tokens} spans={spans ?? []} />
      <button
        type="button" className="diff-comment-add" aria-label={label} title={label}
        onMouseDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onClick={onAdd}
      >+</button>
    </div>
  );
});
