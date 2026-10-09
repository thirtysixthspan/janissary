import React from 'react';
import type { DiffLine } from '@shared/plugins/diff/shared';
import { changedSegments } from './intraline';

// One line's text with the characters a replaced line changed wrapped in a mark of their own. The
// mark is a span inside the line's own text, so the wrap, the strike-through on a removed line, and a
// click's position all behave exactly as they do around plain text.
export function ChangedText({ line, spans }: { line: DiffLine; spans: { from: number; to: number }[] }) {
  const shown = line.text === '' ? ' ' : line.text;
  return (
    <span className="diff-text">
      {changedSegments(shown, spans).map((segment, index) => (segment.changed
        ? <span className="diff-changed" key={index}>{segment.text}</span>
        : <React.Fragment key={index}>{segment.text}</React.Fragment>))}
    </span>
  );
}
