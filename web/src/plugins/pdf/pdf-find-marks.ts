export const PDF_FIND_MATCH = 'pdf-find-match';
export const PDF_FIND_CURRENT = 'pdf-find-current';

export type PdfFindOccurrence = {
  range: Range;
  line: number;
  start: number;
};

type LineNode = { node: Text; start: number };
type LayerLine = { text: string; nodes: LineNode[] };
type LoweredLayerText = {
  text: string;
  toSourceRange(start: number, end: number): [number, number] | null;
};

function lowercaseLayerText(value: string): LoweredLayerText {
  const sourceStarts: number[] = [];
  const sourceEnds: number[] = [];
  let sourceStart = 0;
  for (const character of value) {
    const sourceEnd = sourceStart + character.length;
    const transformedLength = character.toLowerCase().length;
    for (let offset = 0; offset < transformedLength; offset++) {
      sourceStarts.push(sourceStart);
      sourceEnds.push(sourceEnd);
    }
    sourceStart = sourceEnd;
  }

  return {
    text: value.toLowerCase(),
    toSourceRange(start, end) {
      const sourceStart = sourceStarts[start];
      const sourceEnd = sourceEnds[end - 1];
      return sourceStart !== undefined && sourceEnd !== undefined ? [sourceStart, sourceEnd] : null;
    },
  };
}

function layerLines(layer: Element): LayerLine[] {
  const lines: LayerLine[] = [];
  let text = '';
  let nodes: LineNode[] = [];
  const endLine = () => {
    lines.push({ text, nodes });
    text = '';
    nodes = [];
  };
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node instanceof HTMLBRElement) {
      endLine();
      continue;
    }
    if (!(node instanceof Text) || node.data.length === 0) continue;
    nodes.push({ node, start: text.length });
    text += node.data;
  }
  if (text.length > 0) endLine();
  return lines;
}

function startPoint(line: LayerLine, offset: number): [Text, number] {
  for (const entry of line.nodes) {
    if (offset < entry.start + entry.node.data.length) return [entry.node, offset - entry.start];
  }
  const last = line.nodes.at(-1)!;
  return [last.node, last.node.data.length];
}

function endPoint(line: LayerLine, offset: number): [Text, number] {
  const character = offset - 1;
  for (const entry of line.nodes) {
    if (character >= entry.start && character < entry.start + entry.node.data.length) {
      return [entry.node, offset - entry.start];
    }
  }
  const last = line.nodes.at(-1)!;
  return [last.node, last.node.data.length];
}

export function occurrencesInLayer(layer: Element, query: string): PdfFindOccurrence[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const occurrences: PdfFindOccurrence[] = [];
  for (const [line, content] of layerLines(layer).entries()) {
    const lowered = lowercaseLayerText(content.text);
    let start = lowered.text.indexOf(needle);
    while (start !== -1) {
      const sourceRange = lowered.toSourceRange(start, start + needle.length);
      if (sourceRange) {
        const [sourceStart, sourceEnd] = sourceRange;
        const range = document.createRange();
        const [startNode, startOffset] = startPoint(content, sourceStart);
        const [endNode, endOffset] = endPoint(content, sourceEnd);
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        occurrences.push({ range, line, start: sourceStart });
      }
      start = lowered.text.indexOf(needle, start + 1);
    }
  }
  return occurrences;
}

export function paintMarks(ranges: readonly Range[], current: Range | null): () => void {
  if (typeof CSS === 'undefined' || !('highlights' in CSS) || typeof Highlight === 'undefined') {
    return () => {};
  }
  const match = CSS.highlights.get(PDF_FIND_MATCH) ?? new Highlight();
  CSS.highlights.set(PDF_FIND_MATCH, match);
  const active = CSS.highlights.get(PDF_FIND_CURRENT) ?? new Highlight();
  CSS.highlights.set(PDF_FIND_CURRENT, active);
  const added: { highlight: Highlight; range: Range }[] = [];
  for (const range of ranges) {
    const highlight = range === current ? active : match;
    highlight.add(range);
    added.push({ highlight, range });
  }
  return () => {
    for (const { highlight, range } of added) highlight.delete(range);
  };
}
