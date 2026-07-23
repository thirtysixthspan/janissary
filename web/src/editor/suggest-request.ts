// Pure, React-free parsing for the editor's `>`-led persona-suggestion request line, modeled on
// ../ghost-suggestion.ts's isolation of a single-line parsing concern.

export type SuggestRequest = { persona: string; prompt: string };

// The persona-name token right after a leading `>` (and any whitespace before/after it): its
// column range and, when present, its text. Undefined off a `>`-led line entirely — so an
// ordinary Markdown blockquote with no persona word is never mistaken for a request. A leading
// `>>` is the `assistant` shorthand: it returns a zero-length, `synthetic` token so callers treat
// the persona as already named without offering any text to complete.
export function personaToken(line: string): { start: number; end: number; word: string; synthetic?: boolean } | undefined {
  const doubleLead = /^\s*>>\s*/.exec(line);
  if (doubleLead) {
    const start = doubleLead[0].length;
    return { start, end: start, word: 'assistant', synthetic: true };
  }
  const lead = /^\s*>\s*/.exec(line);
  if (!lead) return undefined;
  const start = lead[0].length;
  const rest = line.slice(start);
  const spaceIndex = rest.search(/\s/);
  const end = start + (spaceIndex === -1 ? rest.length : spaceIndex);
  return { start, end, word: line.slice(start, end) };
}

// The prompt text for a `>`-led query: everything after the persona token on its first line, plus
// every line after that (the query may now span several lines, one per Shift+Enter).
function promptFrom(lines: string[], tokenEnd: number): string {
  return [lines[0].slice(tokenEnd), ...lines.slice(1)].join('\n').trimStart();
}

// Whether `text` (the query's full, possibly multi-line content) is a valid `> <persona> <prompt>`
// request, matched case-insensitively against `personas`. The persona word must lead the first
// line. Returns undefined for a non-`>` line, a `>` line whose first word isn't a known persona
// (including a plain blockquote), or one with no persona word at all.
export function parseSuggestRequest(text: string, personas: string[]): SuggestRequest | undefined {
  const lines = text.split('\n');
  const token = personaToken(lines[0]);
  if (!token || !token.word) return undefined;
  const persona = personas.find((p) => p.toLowerCase() === token.word.toLowerCase());
  if (!persona) return undefined;
  return { persona, prompt: promptFrom(lines, token.end) };
}

// The persona-name token's column range on a `>`-led line, when the caret sits inside it — the
// one place Tab completes anything in the editor. Undefined off a request line, or once the caret
// has moved past the first word.
export function personaTokenRange(line: string, col: number): { start: number; end: number; partial: string } | undefined {
  const token = personaToken(line);
  if (!token || token.synthetic || col < token.start || col > token.end) return undefined;
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

export type SuggestPill = { text: string; runnable: boolean };

// The inline status pill for a `>`-led query: its text tracks the request's progress from an
// unnamed persona through to a runnable query, an in-flight one, or a resolved outcome. `text` is
// the query's full, possibly multi-line content. Undefined for text that isn't `>`-led at all, or
// whose pending hunk-review panel already owns its state (Decision: no redundant pill while
// accept/decline is in progress).
export function suggestPillLabel(
  text: string,
  personas: string[],
  firingText: string | null,
  pendingText: string | null,
  noSuggestionText: string | null,
): SuggestPill | undefined {
  const lines = text.split('\n');
  const token = personaToken(lines[0]);
  if (!token) return undefined;
  const hasPersona = personas.some((p) => p.toLowerCase() === token.word.toLowerCase());
  if (!hasPersona) return { text: 'agent?', runnable: false };
  const prompt = promptFrom(lines, token.end);
  if (!prompt) return { text: 'query?', runnable: false };
  if (text === firingText) return { text: 'running...', runnable: false };
  if (text === pendingText) return undefined;
  if (text === noSuggestionText) return { text: 'no suggestion', runnable: false };
  return { text: 'run', runnable: true };
}
