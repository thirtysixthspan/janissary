import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SqlObject } from '@shared/plugins/sql/shared';
import { TableSwitcher } from './TableSwitcher';

// The metadata row's table dropdown: the schema navigator in the form a select can take, beside the
// database dropdown and reloaded with the payload rather than asked for.

function object(over: Partial<SqlObject>): SqlObject {
  return { name: 't', kind: 'table', writable: true, columns: [], ...over };
}

const SCHEMA: SqlObject[] = [
  object({ name: 'orders' }),
  object({ name: 'paid', kind: 'view' }),
  object({ name: 'orders_status', kind: 'index' }),
  object({ name: 'orders_ai', kind: 'trigger' }),
];

const shown = (
  objects: readonly SqlObject[] = SCHEMA,
  current = 'orders',
  onOpen: (object: string) => void = () => {},
) => {
  render(<TableSwitcher payload={{ objects, object: current } as never} onOpen={onOpen} />);
  return screen.getByLabelText('Table') as HTMLSelectElement;
};

describe('TableSwitcher', () => {
  it('offers every object, grouped by kind in the order the schema declares', () => {
    const select = shown();
    expect([...select.options].map((option) => option.value)).toEqual([
      'orders', 'paid', 'orders_status', 'orders_ai',
    ]);
    expect([...select.querySelectorAll('optgroup')].map((group) => group.label))
      .toEqual(['Tables', 'Views', 'Indexes', 'Triggers']);
  });

  it('has the object on screen as its value', () => {
    expect(shown(SCHEMA, 'paid').value).toBe('paid');
  });

  // A trigger is part of the schema and cannot be browsed. The navigator said so in words beside the
  // row; a select says it by refusing the option.
  it('offers a trigger but will not let it be chosen', () => {
    const select = shown();
    const trigger = [...select.options].find((option) => option.value === 'orders_ai');
    expect(trigger?.disabled).toBe(true);
    expect([...select.options].find((option) => option.value === 'paid')?.disabled).toBe(false);
  });

  it('asks for the object chosen', () => {
    const picked: string[] = [];
    const select = shown(SCHEMA, 'orders', (name) => { picked.push(name); });
    fireEvent.change(select, { target: { value: 'paid' } });
    expect(picked).toEqual(['paid']);
  });

  // Choosing a database opens a tab whose payload carries that database's objects, and the server
  // reads its schema before the tab is shown — so the options arrive with the payload rather than
  // being fetched here.
  it('shows another database objects when the payload carries them', () => {
    const select = shown([object({ name: 'posts' })], 'posts');
    expect([...select.options].map((option) => option.value)).toEqual(['posts']);
  });

  it('shows the current object alone on a database with nothing in it', () => {
    expect(shown([], '').value).toBe('');
  });
});
