import React from 'react';
import type { JanusClient } from './ws';

export type FileLinkSegment =
  | { type: 'text'; content: string }
  | { type: 'link'; fullMatch: string; path: string; line: number };

function slurpLineNumber(text: string, start: number): { line: number; col?: number; length: number } | null {
  if (start >= text.length || !/\d/.test(text[start])) return null;
  let pos = start;
  while (pos < text.length && /\d/.test(text[pos])) pos++;
  const line = Number(text.slice(start, pos));
  let col: number | undefined;
  if (pos < text.length && text[pos] === ':') {
    const colStart = pos + 1;
    if (colStart < text.length && /\d/.test(text[colStart])) {
      pos = colStart;
      while (pos < text.length && /\d/.test(text[pos])) pos++;
      col = Number(text.slice(colStart, pos));
    }
  }
  if (pos < text.length && /\w/.test(text[pos])) return null;
  return { line, col, length: pos - start };
}

export function fileLineSegments(text: string): FileLinkSegment[] {
  const segments: FileLinkSegment[] = [];
  let pos = 0;

  function emitText(end: number) {
    if (end <= pos) return;
    const content = text.slice(pos, end);
    const last = segments.at(-1);
    if (last && last.type === 'text') {
      last.content += content;
    } else {
      segments.push({ type: 'text', content });
    }
    pos = end;
  }

  while (pos < text.length) {
    const colonIdx = text.indexOf(':', pos);
    if (colonIdx === -1) break;

    if (colonIdx + 1 >= text.length || !/\d/.test(text[colonIdx + 1])) {
      emitText(colonIdx + 1);
      pos = colonIdx + 1;
      continue;
    }

    let pathStart = colonIdx;
    while (pathStart > pos) {
      const prev = text[pathStart - 1];
      if (prev === '\n' || ' "\'`()[]{}<>'.includes(prev)) break;
      pathStart--;
    }

    const path = text.slice(pathStart, colonIdx);
    if (!(path.includes('/') || path.includes('\\')) || path.length < 2) {
      emitText(colonIdx + 1);
      pos = colonIdx + 1;
      continue;
    }

    const parsed = slurpLineNumber(text, colonIdx + 1);
    if (!parsed) {
      emitText(colonIdx + 1);
      pos = colonIdx + 1;
      continue;
    }

    const fullMatch = text.slice(pathStart, colonIdx + 1 + parsed.length);
    emitText(pathStart);
    segments.push({ type: 'link', fullMatch, path, line: parsed.line });
    pos = colonIdx + 1 + parsed.length;
  }

  emitText(text.length);

  return segments;
}

export function linkifyMarkdown(text: string): string {
  const segments = fileLineSegments(text);
  if (segments.every((s) => s.type === 'text')) return text;
  return segments.map((s) => (s.type === 'link' ? `[${s.fullMatch}](${s.fullMatch})` : s.content)).join('');
}

export function renderFileLinkSegments(
  segments: FileLinkSegment[],
  client: JanusClient,
): React.ReactNode[] {
  return segments.map((seg, i) => {
    if (seg.type === 'text') {
      return seg.content || null;
    }
    const editCmd = `edit ${seg.path}`;
    return React.createElement(
      'span',
      {
        key: i,
        className: 'file-link',
        title: `${seg.fullMatch} — click to open`,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          client.send({ method: 'command', params: { text: editCmd } });
        },
      },
      seg.fullMatch,
    );
  });
}
