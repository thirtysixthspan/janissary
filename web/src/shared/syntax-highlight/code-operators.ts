import type { TokenRange } from './tokenize';

const OPERATORS = /[+\-*/%=!<>&|^~?:]+/g;

function operatorRanges(text: string, from: number, to: number): TokenRange[] {
  return [...text.slice(from, to).matchAll(OPERATORS)].map((match) => ({
    from: from + match.index,
    to: from + match.index + match[0].length,
    scope: 'hljs-operator',
  }));
}

export function codeOperatorTokens(text: string, tokens: TokenRange[], language: string): TokenRange[] {
  if (language !== 'javascript' && language !== 'typescript') return tokens;
  const operators: TokenRange[] = [];
  let from = 0;
  for (const token of tokens) {
    operators.push(...operatorRanges(text, from, token.from));
    from = token.to;
  }
  operators.push(...operatorRanges(text, from, text.length));
  return operators.length === 0 ? tokens : [...tokens, ...operators].toSorted((a, b) => a.from - b.from);
}
