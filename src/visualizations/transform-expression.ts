// The arithmetic behind a derived column: numbers, column names, `+ - * /`, unary minus, and
// parentheses, and nothing else. No names, no calls, no property access, and no `eval` — a chart is a
// specification a model produces, and the one thing that must never happen is that a model's words
// become code that runs.
//
// A row whose arithmetic cannot be performed yields nothing rather than throwing, which is the same
// rule the chart's arithmetic already follows for a measure that is not a number: a value that is not
// usable is dropped, not guessed at. Everything about the *expression* that cannot be parsed is
// refused by name instead, so the model is told what to fix rather than shown a chart with a column
// quietly missing from it.

import type { Cell, Table } from './table.js';

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'name'; value: string }
  | { kind: 'operator'; value: string };

const OPERATORS = new Set(['+', '-', '*', '/', '(', ')']);
const WHITESPACE = /\s/u;

function isDigit(character: string): boolean {
  return character >= '0' && character <= '9';
}

// Longest column name first at every position, so a column called `revenue` and another called
// `revenue per month` are both writable in an expression without quoting either. Matching a name
// before trying to read a number is what makes a name beginning with a digit work, and matching the
// longest first is what stops `revenue` from swallowing the start of `revenue per month`.
function tokenize(expression: string, names: readonly string[]): Token[] | undefined {
  const ordered = [...names].toSorted((a, b) => b.length - a.length);
  const tokens: Token[] = [];
  let at = 0;
  while (at < expression.length) {
    const character = expression[at];
    if (WHITESPACE.test(character)) { at += 1; continue; }
    if (OPERATORS.has(character)) {
      tokens.push({ kind: 'operator', value: character });
      at += 1;
      continue;
    }
    const name = ordered.find((candidate) => expression.startsWith(candidate, at));
    if (name !== undefined) {
      tokens.push({ kind: 'name', value: name });
      at += name.length;
      continue;
    }
    if (isDigit(character) || (character === '.' && isDigit(expression[at + 1] ?? ''))) {
      const end = numberEnd(expression, at);
      const value = Number(expression.slice(at, end));
      if (!Number.isFinite(value)) return undefined;
      tokens.push({ kind: 'number', value });
      at = end;
      continue;
    }
    return undefined;
  }
  return tokens;
}

function numberEnd(expression: string, from: number): number {
  let at = from;
  let seenDot = false;
  while (at < expression.length) {
    const character = expression[at];
    if (isDigit(character)) { at += 1; continue; }
    if (character === '.' && !seenDot) { seenDot = true; at += 1; continue; }
    break;
  }
  return at;
}

// A parsed expression, held as the operations rather than as a closure over the table so the whole
// grammar stays inspectable and the caller decides once per row how to read a cell.
type Operation =
  | { kind: 'literal'; value: number }
  | { kind: 'column'; name: string }
  | { kind: 'binary'; operator: string; left: Operation; right: Operation }
  | { kind: 'negate'; value: Operation };

class Reader {
  private at = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  // An empty expression is refused rather than treated as zero: `derive` with a blank expression
  // would add a column of zeroes, which is a chart that looks right and means nothing.
  read(): Operation | undefined {
    const operation = this.sum();
    return operation !== undefined && this.at === this.tokens.length ? operation : undefined;
  }

  private peek(): Token | undefined {
    return this.tokens[this.at];
  }

  private take(kind: Token['kind'], value?: string): boolean {
    const token = this.peek();
    if (token?.kind !== kind) return false;
    if (value !== undefined && (token.kind !== 'operator' || token.value !== value)) return false;
    this.at += 1;
    return true;
  }

  // Consumes the next token when it is one of `values` and returns it, or nothing. One place decides
  // what an operator token is, so the two precedence levels below read as the grammar they are.
  private operator(values: readonly string[]): string | undefined {
    const token = this.peek();
    if (token?.kind !== 'operator' || !values.includes(token.value)) return undefined;
    this.at += 1;
    return token.value;
  }

  private sum(): Operation | undefined {
    const first = this.product();
    if (first === undefined) return undefined;
    let left = first;
    for (let operator = this.operator(['+', '-']); operator !== undefined; operator = this.operator(['+', '-'])) {
      const right = this.product();
      if (right === undefined) return undefined;
      left = { kind: 'binary', operator, left, right };
    }
    return left;
  }

  private product(): Operation | undefined {
    const first = this.unary();
    if (first === undefined) return undefined;
    let left = first;
    for (let operator = this.operator(['*', '/']); operator !== undefined; operator = this.operator(['*', '/'])) {
      const right = this.unary();
      if (right === undefined) return undefined;
      left = { kind: 'binary', operator, left, right };
    }
    return left;
  }

  private unary(): Operation | undefined {
    if (this.take('operator', '-')) {
      const value = this.unary();
      return value === undefined ? undefined : { kind: 'negate', value };
    }
    return this.atom();
  }

  private atom(): Operation | undefined {
    if (this.take('operator', '(')) {
      const inner = this.sum();
      return inner !== undefined && this.take('operator', ')') ? inner : undefined;
    }
    const token = this.peek();
    if (token === undefined) return undefined;
    this.at += 1;
    if (token.kind === 'number') return { kind: 'literal', value: token.value };
    if (token.kind === 'name') return { kind: 'column', name: token.value };
    return undefined;
  }
}

function number(cell: Cell | undefined): number | undefined {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : undefined;
  if (typeof cell !== 'string' || cell.trim() === '') return undefined;
  const parsed = Number(cell);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function apply(operation: Operation, row: readonly Cell[], columns: ReadonlyMap<string, number>): number | undefined {
  if (operation.kind === 'literal') return operation.value;
  if (operation.kind === 'negate') {
    const value = apply(operation.value, row, columns);
    return value === undefined ? undefined : -value;
  }
  if (operation.kind === 'column') {
    const index = columns.get(operation.name);
    return index === undefined ? undefined : number(row[index]);
  }
  const left = apply(operation.left, row, columns);
  const right = apply(operation.right, row, columns);
  if (left === undefined || right === undefined) return undefined;
  const result = operation.operator === '+' ? left + right
    : operation.operator === '-' ? left - right
      : operation.operator === '*' ? left * right
        : left / right;
  // A division by zero and an overflow both land here, and both are a cell that cannot be used rather
  // than a chart that cannot be drawn.
  return Number.isFinite(result) ? result : undefined;
}

// The compiled form of one expression, so a table is not re-tokenized once per row.
export type CompiledExpression = {
  operation: Operation;
  columns: ReadonlyMap<string, number>;
};

export function compileExpression(
  expression: string,
  table: Table,
): CompiledExpression | undefined {
  const names = table.columns.map((column) => column.name);
  const tokens = tokenize(expression, names);
  if (!tokens) return undefined;
  const operation = new Reader(tokens).read();
  if (!operation) return undefined;
  const columns = new Map(table.columns.map((column, index) => [column.name, index]));
  return { operation, columns };
}

export function evaluateExpression(compiled: CompiledExpression, row: readonly Cell[]): Cell {
  return apply(compiled.operation, row, compiled.columns) ?? null;
}
