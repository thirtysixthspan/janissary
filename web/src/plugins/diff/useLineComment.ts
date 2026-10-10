import { useCallback, useContext } from 'react';
import type { DiffLine } from '@shared/plugins/diff/shared';
import { LineCommentContext } from './line-comment-context';

export function useLineComment(line: DiffLine, side: 'original' | 'modified' = line.kind === 'removed' ? 'original' : 'modified') {
  const scope = useContext(LineCommentContext);
  if (!scope) throw new Error('Line comments require a file scope');
  const number = side === 'original' ? line.oldNumber ?? line.number : line.number;
  const key = `${side}:${number}`;
  const dispatch = scope.dispatch;
  const source = line.text;
  const start = useCallback(() => dispatch({ type: 'start', key, source }), [dispatch, key, source]);
  return {
    label: `${side} line ${number}`,
    note: scope.state.notes.get(key),
    draft: scope.state.drafts.get(key),
    changed: scope.state.notes.get(key)?.source !== line.text,
    start,
    edit: (body: string) => scope.dispatch({ type: 'edit', key, body }),
    save: () => scope.dispatch({ type: 'save', key }),
    cancel: () => scope.dispatch({ type: 'cancel', key }),
    remove: () => scope.dispatch({ type: 'remove', key }),
  };
}

export type LineReview = ReturnType<typeof useLineComment>;
