export type Token = { value: string; start: number; end: number };

export function isFullyQuoted(value: string): boolean {
  const quote = value.charAt(0);
  if ((quote !== '"' && quote !== "'") || value.at(-1) !== quote) return false;
  for (let index = 1; index < value.length; index++) {
    if (value[index] === '\\' && value[index + 1] === quote) {
      index++;
      continue;
    }
    if (value[index] === quote) return index === value.length - 1;
  }
  return false;
}

export function skipSpaces(input: string, start: number): number {
  let index = start;
  while (/\s/.test(input[index] ?? '')) index++;
  return index;
}

export function readToken(input: string, start: number): Token | undefined {
  let index = start;
  let value = '';
  let quote = '';
  while (index < input.length) {
    const char = input[index] ?? '';
    if (quote) {
      if (char === quote) quote = '';
      else if (char === '\\' && input[index + 1] === quote) value += input[++index];
      else value += char;
      index++;
    } else if (char === '"' || char === "'") {
      quote = char;
      index++;
    } else if (/\s/.test(char)) break;
    else {
      value += char;
      index++;
    }
  }
  return quote ? undefined : { value, start, end: index };
}
