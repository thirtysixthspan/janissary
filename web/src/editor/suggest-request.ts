// Pure, React-free parsing for the editor's `>`-led persona-suggestion request line, modeled on
// ../ghost-suggestion.ts's isolation of a single-line parsing concern.

export type SuggestRequest = { persona: string; prompt: string };

// The persona-name token right after a leading `>` (and any whitespace before/after it): its
// column range and, when present, its text. Undefined off a `>`-led line entirely — so an
// ordinary Markdown blockquote with no persona word is never mistaken for a request.
function personaToken(line: string): { start: number; end: number; word: string } | undefined {
  const lead = /^\s*>\s*/.exec(line);
  if (!lead) return undefined;
  const start = lead[0].length;
  const rest = line.slice(start);
  const spaceIndex = rest.search(/\s/);
  const end = start + (spaceIndex === -1 ? rest.length : spaceIndex);
  return { start, end, word: line.slice(start, end) };
}

// Whether `line` is a valid `> <persona> <prompt>` request, matched case-insensitively against
// `personas`. Returns undefined for a non-`>` line, a `>` line whose first word isn't a known
// persona (including a plain blockquote), or one with no persona word at all.
export function parseSuggestRequest(line: string, personas: string[]): SuggestRequest | undefined {
  const token = personaToken(line);
  if (!token || !token.word) return undefined;
  const persona = personas.find((p) => p.toLowerCase() === token.word.toLowerCase());
  if (!persona) return undefined;
  return { persona, prompt: line.slice(token.end).trimStart() };
}

// The persona-name token's column range on a `>`-led line, when the caret sits inside it — the
// one place Tab completes anything in the editor. Undefined off a request line, or once the caret
// has moved past the first word.
export function personaTokenRange(line: string, col: number): { start: number; end: number; partial: string } | undefined {
  const token = personaToken(line);
  if (!token || col < token.start || col > token.end) return undefined;
  return { start: token.start, end: token.end, partial: line.slice(token.start, col) };
}

// The full persona name Tab-completion would insert for the token at `col`, or undefined when the
// caret isn't in a completable position or no known persona matches the typed prefix.
export function completePersonaName(line: string, col: number, personas: string[]): { start: number; end: number; name: string } | undefined {
  const range = personaTokenRange(line, col);
  if (!range) return undefined;
  const name = personas.find((p) => p.toLowerCase().startsWith(range.partial.toLowerCase()));
  return name ? { start: range.start, end: range.end, name } : undefined;
}
