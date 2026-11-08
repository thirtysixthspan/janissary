export type PdfTextItem = {
  text: string;
  hasEOL: boolean;
  top: number;
};

export type PdfLine = {
  text: string;
  page: number;
  index: number;
  top: number;
};

export function pageLines(page: number, items: readonly PdfTextItem[]): PdfLine[] {
  const lines: PdfLine[] = [];
  let text = '';
  let top = 0;
  let open = false;
  for (const item of items) {
    if (!open) {
      top = item.top;
      open = true;
    }
    text += item.text;
    if (item.hasEOL) {
      lines.push({ text, page, index: lines.length, top });
      text = '';
      open = false;
    }
  }
  if (open) lines.push({ text, page, index: lines.length, top });
  return lines;
}
