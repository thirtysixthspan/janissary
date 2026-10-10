import { createContext } from 'react';
import type { CommentAction, CommentState } from './comment-state';

export const LineCommentContext = createContext<{
  state: CommentState;
  dispatch(action: CommentAction): void;
} | null>(null);
