import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SchemaNavigator } from './SchemaNavigator';
import { makeCapabilities, ORDERS, PAID, payload } from './fixture';

const MORE = {
  ...PAID,
  name: 'i_orders', kind: 'index' as const, columns: [],
};
const TRIGGER = { ...PAID, name: 'orders_touch', kind: 'trigger' as const };

describe('SchemaNavigator', () => {
  it('lists each object under its own group, tables first', () => {
    const { capabilities } = makeCapabilities();
    render(<SchemaNavigator
      payload={payload({ objects: [MORE, PAID, ORDERS, TRIGGER], object: '' })}
      capabilities={capabilities}
    />);
    const groups = screen.getAllByText(/^(Tables|Views|Indexes|Triggers)$/).map((node) => node.textContent);
    expect(groups).toEqual(['Tables', 'Views', 'Indexes', 'Triggers']);
  });

  it('asks to select a browsable object, and marks the selected one', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<SchemaNavigator payload={payload()} capabilities={capabilities} />);
    fireEvent.click(screen.getByText('orders'));
    expect(intent).toHaveBeenCalledWith('select-object', { object: 'orders' });
    expect(screen.getByText('orders').closest('.sql-nav-row')?.className).toContain('selected');
  });

  it('lists a trigger but does nothing when it is pressed, and says why', () => {
    const { capabilities, intent } = makeCapabilities();
    render(<SchemaNavigator payload={payload({ objects: [TRIGGER] })} capabilities={capabilities} />);
    const row = screen.getByText('orders_touch').closest('.sql-nav-row');
    expect(row?.className).toContain('inert');
    fireEvent.click(screen.getByText('orders_touch'));
    expect(intent).not.toHaveBeenCalled();
  });

  it('says there is nothing to browse in an empty database', () => {
    const { capabilities } = makeCapabilities();
    render(<SchemaNavigator payload={payload({ objects: [] })} capabilities={capabilities} />);
    expect(screen.getByText('No tables.')).toBeTruthy();
  });
});
