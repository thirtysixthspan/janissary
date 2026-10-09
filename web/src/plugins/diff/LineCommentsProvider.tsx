import React, { useReducer } from 'react';
import { commentReducer } from './comment-state';
import { LineCommentContext } from './line-comment-context';

export function LineCommentsProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(commentReducer, { notes: new Map(), drafts: new Map() });
  return <LineCommentContext.Provider value={{ state, dispatch }}>{children}</LineCommentContext.Provider>;
}
