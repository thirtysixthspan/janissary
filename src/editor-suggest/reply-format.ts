import type { SuggestHunk } from '../protocol.js';

// The in-editor suggestion reply format, modeled on monitor/reply-format.ts's marker-capture
// approach but repeated per hunk: each proposed edit is one `[HUNK]...[/HUNK]` block naming the
// exact existing text to replace (empty for a pure insertion at the end of the file) and its
// replacement (empty to delete the anchor text with nothing). Zero blocks means nothing to
// suggest.
export const HUNK_FORMAT = [
  'Reply with zero or more proposed edits, each in exactly this format:',
  '[HUNK]',
  '[ANCHOR]: <the exact existing text to replace, or leave empty to insert at the end of the file>',
  '[REPLACEMENT]: <the replacement text, or leave empty to delete the anchor text>',
  '[/HUNK]',
  'Use one [HUNK]...[/HUNK] block per proposed edit, anywhere in the file. If you have nothing to',
  'propose, reply with no [HUNK] blocks at all.',
].join('\n');

const HUNK_BLOCK_RE = /\[HUNK]\n([\s\S]*?)\n\[\/HUNK]/g;

// Extract the text following a `[FIELD]:` line within one hunk block, up to the next bracket
// marker or the end of the block. Undefined when the field is missing entirely (a malformed
// block), distinct from an empty string (a deliberate insertion/deletion contract).
function captureField(block: string, name: string): string | undefined {
  const re = new RegExp(String.raw`(?:^|\n)\[${name}]:[ \t]*([\s\S]*?)(?=\n\[[A-Z]+]:|$)`);
  return re.exec(block)?.[1]?.trim();
}

// Parse every `[HUNK]...[/HUNK]` block in a persona's reply into an ordered list of hunks. A
// block missing either its ANCHOR or REPLACEMENT field is malformed and is dropped rather than
// guessed at; an empty list means the reply proposed nothing.
export function parseHunks(reply: string): SuggestHunk[] {
  const hunks: SuggestHunk[] = [];
  for (const match of reply.matchAll(HUNK_BLOCK_RE)) {
    const block = match[1];
    const anchor = captureField(block, 'ANCHOR');
    const replacement = captureField(block, 'REPLACEMENT');
    if (anchor === undefined || replacement === undefined) continue;
    hunks.push({ anchor, replacement });
  }
  return hunks;
}
