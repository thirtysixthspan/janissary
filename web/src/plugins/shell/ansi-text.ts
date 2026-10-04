// SGR styling for text written straight to the terminal. Each style is switched off with its own
// reset code rather than the global one, so a bold word inside a heading's underline does not end
// the underline with it.
const ESCAPE = String.fromCodePoint(0x1B);
const CSI = `${ESCAPE}[`;

function sgr(on: number, off: number): (text: string) => string {
  return (text) => `${CSI}${on}m${text}${CSI}${off}m`;
}

export const ansi = {
  bold: sgr(1, 22),
  dim: sgr(2, 22),
  italic: sgr(3, 23),
  underline: sgr(4, 24),
  strike: sgr(9, 29),
  code: sgr(36, 39),
};

// The columns a styled string takes on screen: its escapes, which run from the escape character to
// the `m` that ends them, take none.
export function visibleWidth(text: string): number {
  let width = 0;
  let inSequence = false;
  for (const character of text) {
    if (inSequence) inSequence = character !== 'm';
    else if (character === ESCAPE) inSequence = true;
    else width += 1;
  }
  return width;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
};

// The lexer leaves character references as written, since its HTML renderer would emit them as they
// are; a terminal shows the character itself.
export function decodeEntities(text: string): string {
  return text.replaceAll(/&(?:amp|lt|gt|quot|#39);/gu, (entity) => ENTITIES[entity] ?? entity);
}
