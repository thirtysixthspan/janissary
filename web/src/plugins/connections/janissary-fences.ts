type Fence = { character: string; length: number; janissary: boolean };
type FenceLine = { leading: string; marker: string; rest: string };

const OPENING = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const CLOSING = /^( {0,3})(`+|~+)([ \t]*)$/;

function escapeMarker(leading: string, marker: string, rest: string): string {
  return `${leading}${marker.replaceAll(/[`~]/g, (character) => `\\${character}`)}${rest}`;
}

function openingFence(line: string): FenceLine | undefined {
  const opening = OPENING.exec(line);
  const marker = opening?.[2];
  if (!marker || (marker.startsWith('`') && opening[3].includes('`'))) return undefined;
  return { leading: opening[1], marker, rest: opening[3] };
}

function closingFence(line: string, open: Fence): FenceLine | undefined {
  const close = CLOSING.exec(line);
  const marker = close?.[2];
  if (!marker || !marker.startsWith(open.character) || marker.length < open.length) return undefined;
  return { leading: close[1], marker, rest: close[3] };
}

// A message rendered as Markdown would consume a ```janissary fence into a code block, hiding the
// literal fence lines the reader needs to see. Escaping only those delimiter lines keeps the fences
// visible while leaving the rest of the message on the Markdown path.
export function preserveJanissaryFences(text: string): string {
  const result: string[] = [];
  let open: Fence | undefined;
  for (const line of text.split('\n')) {
    const fenceLine = open ? closingFence(line, open) : openingFence(line);
    if (fenceLine === undefined) {
      result.push(line);
      continue;
    }
    const janissary = open ? open.janissary : fenceLine.rest.trim() === 'janissary';
    result.push(janissary ? escapeMarker(fenceLine.leading, fenceLine.marker, fenceLine.rest) : line);
    open = open
      ? undefined
      : { character: fenceLine.marker[0], length: fenceLine.marker.length, janissary };
  }
  return result.join('\n');
}
