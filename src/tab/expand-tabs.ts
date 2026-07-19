// Tab-width expansion, split out of formatting-handlers.ts: a low-level string utility used by
// (but otherwise unrelated to) the transcript-line handlers that remain there.
export function expandTabs(text: string, tabWidth = 8): string {
  if (!text.includes('\t')) return text;
  let col = 0;
  let out = '';
  for (const ch of text) {
    if (ch === '\t') {
      const spaces = tabWidth - (col % tabWidth);
      out += ' '.repeat(spaces);
      col += spaces;
    } else {
      out += ch;
      col += ch === '\n' ? 0 : 1;
    }
  }
  return out;
}
