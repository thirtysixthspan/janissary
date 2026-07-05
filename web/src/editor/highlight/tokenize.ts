import { hljs } from './hljs';

export type TokenRange = { from: number; to: number; scope: string };

type WalkState = { line: number; col: number };

// Walk one parsed DOM node, tracking the innermost `hljs-*` class as the active scope. Text nodes
// emit ranges into `perLine`, splitting at newlines so multi-line constructs (fenced code blocks,
// block comments, template literals) land on the right lines.
function walk(node: ChildNode, scope: string | undefined, state: WalkState, perLine: TokenRange[][]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const parts = (node.textContent ?? '').split('\n');
    for (const [index, part] of parts.entries()) {
      if (part.length > 0 && scope) {
        perLine[state.line] ??= [];
        perLine[state.line].push({ from: state.col, to: state.col + part.length, scope });
      }
      state.col += part.length;
      if (index < parts.length - 1) { state.line++; state.col = 0; }
    }
    return;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    const childScope = element.getAttribute('class') ?? scope;
    for (const child of element.childNodes) walk(child, childScope, state, perLine);
  }
}

function computeTokens(text: string, language: string): TokenRange[][] {
  const lineCount = text.split('\n').length;
  const perLine: TokenRange[][] = Array.from({ length: lineCount }, () => []);
  let html: string;
  try {
    html = hljs.highlight(text, { language, ignoreIllegals: true }).value;
  } catch {
    return perLine;
  }
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstChild;
  if (!root) return perLine;
  const state: WalkState = { line: 0, col: 0 };
  for (const child of root.childNodes) walk(child, undefined, state, perLine);
  return perLine;
}

function sameTokens(a: TokenRange[] | undefined, b: TokenRange[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((range, index) => range.from === b[index].from && range.to === b[index].to && range.scope === b[index].scope);
}

let previousLanguage: string | null = null;
let previousLines: string[] = [];
let previousTokens: TokenRange[][] = [];

// Tokenize the full document and split it into per-line token-range arrays. When a line's text and
// freshly computed tokens both match the previous run, its previous array object is reused
// (referentially), so `EditorLine`'s default `React.memo` still skips re-rendering unchanged lines.
export function tokenizeDocument(text: string, language: string): TokenRange[][] {
  const lines = text.split('\n');
  if (language !== previousLanguage) {
    previousLanguage = language;
    previousLines = [];
    previousTokens = [];
  }
  const fresh = computeTokens(text, language);
  const result = lines.map((line, index) => {
    if (previousLines[index] === line && sameTokens(previousTokens[index], fresh[index])) return previousTokens[index];
    return fresh[index];
  });
  previousLines = lines;
  previousTokens = result;
  return result;
}
