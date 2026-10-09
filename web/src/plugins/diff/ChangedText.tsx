import React from 'react';
import type { DiffLine } from '@shared/plugins/diff/shared';
import type { TokenRange } from '../api';
import { syntaxSegments } from './syntax-segments';

// One line's text with the characters a replaced line changed wrapped in a mark of their own. The
// mark is a span inside the line's own text, so the wrap, the syntax colors, and a
// click's position all behave exactly as they do around plain text.
export function ChangedText({ line, spans, tokens }: {
  line: DiffLine;
  spans: { from: number; to: number }[];
  tokens: TokenRange[];
}) {
  return (
    <span className="diff-text">
      {syntaxSegments(line.text, spans, tokens).map((segment) => (
        <span className={segment.className || undefined} key={segment.from}>{segment.text}</span>
      ))}
    </span>
  );
}
