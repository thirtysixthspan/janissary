import { describe, it, expect } from 'vitest';
import { compileExpression, evaluateExpression } from './transform-expression.js';
import type { Cell, Table } from './table.js';

function table(names: string[], rows: Cell[][]): Table {
  return {
    columns: names.map((name) => ({ name, type: 'number' as const })),
    rows,
  };
}

function value(expression: string, names: string[], row: Cell[]): Cell {
  const compiled = compileExpression(expression, table(names, []));
  if (!compiled) return 'uncompiled';
  return evaluateExpression(compiled, row);
}

describe('compileExpression', () => {
  it('compiles arithmetic over named columns', () => {
    const compiled = compileExpression('revenue / headcount', table(['revenue', 'headcount'], []));
    expect(compiled).toBeDefined();
  });

  it('refuses an empty expression rather than treating it as zero', () => {
    expect(compileExpression(' '.repeat(3), table(['revenue'], []))).toBeUndefined();
  });

  it('refuses an unknown column name', () => {
    expect(compileExpression('revenue / cost', table(['revenue', 'headcount'], []))).toBeUndefined();
  });

  it('refuses a missing operand', () => {
    expect(compileExpression('revenue +', table(['revenue'], []))).toBeUndefined();
    expect(compileExpression('* 2', table(['revenue'], []))).toBeUndefined();
  });

  it('refuses an unbalanced parenthesis', () => {
    expect(compileExpression('(revenue + 1', table(['revenue'], []))).toBeUndefined();
    expect(compileExpression('revenue + 1)', table(['revenue'], []))).toBeUndefined();
  });

  it('refuses a stray character', () => {
    expect(compileExpression('revenue $ 2', table(['revenue'], []))).toBeUndefined();
    expect(compileExpression('revenue; headcount', table(['revenue', 'headcount'], []))).toBeUndefined();
  });

  it('refuses a function call rather than evaluating anything', () => {
    expect(compileExpression('max(revenue)', table(['revenue'], []))).toBeUndefined();
  });

  it('matches the longest column name where one is a prefix of another', () => {
    const compiled = compileExpression('revenue per month / 12', table(['revenue', 'revenue per month'], []));
    expect(evaluateExpression(compiled!, [100, 2400])).toBe(200);
  });

  it('reads a column name beginning with a digit', () => {
    expect(value('2024 revenue + 1', ['2024 revenue'], [41])).toBe(42);
  });
});

describe('evaluateExpression', () => {
  const columns = ['revenue', 'headcount', 'margin'];

  it('divides one column by another', () => {
    expect(value('revenue / headcount', columns, [1000, 4, 100])).toBe(250);
  });

  it('respects precedence and parentheses', () => {
    expect(value('1 + 2 * 3', columns, [0, 0, 0])).toBe(7);
    expect(value('(1 + 2) * 3', columns, [0, 0, 0])).toBe(9);
  });

  it('applies unary minus', () => {
    expect(value('-revenue', columns, [7, 1, 1])).toBe(-7);
    expect(value('revenue - -1', columns, [7, 1, 1])).toBe(8);
  });

  it('reads a numeric string, the way a CSV produces one', () => {
    expect(value('revenue / headcount', columns, ['1000', '4', 'x'])).toBe(250);
  });

  it('yields an empty cell for a division by zero rather than throwing', () => {
    expect(value('revenue / headcount', columns, [1000, 0, 1])).toBeNull();
  });

  it('yields an empty cell where a number was needed and text was found', () => {
    expect(value('revenue * 2', columns, ['n/a', 1, 1])).toBeNull();
  });

  it('yields an empty cell for an empty operand', () => {
    expect(value('revenue + margin', columns, [1, 1, null])).toBeNull();
  });
});
