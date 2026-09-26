import React from 'react';
import { matchRange } from '@shared/search-matches';
import { fileLineSegments, renderFileLinkSegments } from './file-link';
import type { TranscriptIntents } from './transcript-intents';
import { hasAnsiCodes, parseAnsi } from './ansi';

// A transcript line's text and the search match over it. One module for the whole path from a raw
// line's text to the nodes it renders as, so a line's type decides which of these it wants rather
// than each branch reassembling them.

// The current search match's line index and pattern, for substring highlighting. `null`/`undefined`
// when search mode is closed or no match is current.
export type LineHighlight = { lineIndex: number; pattern: string } | null;

export function hitForLine(highlight: LineHighlight | undefined, index: number): { hit: boolean; props: Record<string, unknown> } {
  const hit = !!highlight && highlight.lineIndex === index;
  return { hit, props: hit ? { 'data-search-hit': true } : {} };
}

// Wrap the first match of `pattern` in `text` with a `search-hit` span, or return the text
// unchanged when there's no match (or highlighting isn't active for this line).
export function highlightText(text: string, highlight: LineHighlight | undefined, index: number): React.ReactNode {
  if (!highlight || highlight.lineIndex !== index) return text;
  const range = matchRange(text, highlight.pattern);
  if (!range) return text;
  return (
    <>
      {text.slice(0, range.start)}
      <span className="search-hit">{text.slice(range.start, range.end)}</span>
      {text.slice(range.end)}
    </>
  );
}

// Renders ANSI-styled segments; when `intents` is given, each segment's text is additionally run
// through file-link detection (composes cleanly since segments are already escape-code-free).
function renderAnsiSegments(text: string, intents?: TranscriptIntents): React.ReactNode[] {
  return parseAnsi(text).map((seg, i) => {
    const content: React.ReactNode = intents ? renderFileLinkSegments(fileLineSegments(seg.text), intents) : seg.text;
    if (seg.className) return <span key={i} className={seg.className}>{content}</span>;
    return intents ? <React.Fragment key={i}>{content}</React.Fragment> : content;
  });
}

// Shared by the `running` and `acp` branches (neither does file-link detection): the current
// search hit still wins, then ANSI styling, then plain highlighted text as before.
export function renderOutputText(text: string, highlight: LineHighlight | undefined, index: number): React.ReactNode {
  if (highlight && highlight.lineIndex === index) return highlightText(text, highlight, index);
  if (hasAnsiCodes(text)) return renderAnsiSegments(text);
  return highlightText(text, highlight, index);
}

export function renderTextContent(
  text: string,
  highlight: LineHighlight | undefined,
  index: number,
  hit: boolean,
  intents: TranscriptIntents,
): React.ReactNode {
  if (hit) return highlightText(text, highlight, index);
  if (hasAnsiCodes(text)) return renderAnsiSegments(text, intents);
  return renderFileLinkSegments(fileLineSegments(text), intents);
}
