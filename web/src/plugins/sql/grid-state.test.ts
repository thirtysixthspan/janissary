import { describe, expect, it } from 'vitest';
import { ORDERS, PAID, grid, payload, ROWS } from './fixture';
import { cellDraftValue, projectGridWriteState } from './grid-state';

describe('projectGridWriteState', () => {
  it('returns no object and no explanation for a missing selection', () => {
    expect(projectGridWriteState(payload({ object: 'missing' }))).toEqual({
      object: undefined,
      statement: false,
      writable: false,
      readOnly: null,
    });
  });

  it('marks a selected view read-only with the existing explanation', () => {
    expect(projectGridWriteState(payload({ object: 'paid' }))).toEqual({
      object: PAID,
      statement: false,
      writable: false,
      readOnly: 'Read-only: "paid" is a view.',
    });
  });

  it('keeps an empty keyless statement result read-only over a writable object', () => {
    const state = projectGridWriteState(payload({
      grid: grid({ keyless: true, rows: [], total: 0 }),
    }));
    expect(state).toEqual({
      object: ORDERS,
      statement: true,
      writable: false,
      readOnly: "Read-only: this is a statement's result, not a table.",
    });
  });
});

describe('cellDraftValue', () => {
  it('looks up a reordered cell by its declared column name', () => {
    const reordered = grid({ columns: ['status', 'id'] });
    const reorderedRow = { key: 'r1', cells: [{ text: 'paid', isNull: false }, { text: '1', isNull: false }] };
    expect(cellDraftValue(reordered, reorderedRow, 'status')).toBe('paid');
  });

  it('uses an empty draft when the named column or cell is missing', () => {
    expect(cellDraftValue(grid(), ROWS[0]!, 'missing')).toBe('');
    expect(cellDraftValue(grid({ columns: ['id', 'status'] }), { key: 'r3', cells: [] }, 'status')).toBe('');
  });

  it('keeps SQL NULL distinct from empty text', () => {
    expect(cellDraftValue(grid(), ROWS[1]!, 'status')).toBeNull();
    expect(cellDraftValue(grid(), { key: 'r3', cells: [{ text: '', isNull: false }] }, 'id')).toBe('');
  });
});
