import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SqlPayload } from '@shared/plugins/sql/shared';
import { DatabaseSwitcher } from './DatabaseSwitcher';
import { payload } from './fixture';

const shown = (over: Partial<SqlPayload> = {}, onOpen: (name: string) => void = () => {}) => {
  render(<DatabaseSwitcher payload={payload(over)} onOpen={onOpen} />);
};

describe('DatabaseSwitcher', () => {
  it('shows the derived label and the full path as a tooltip for a path-backed tab', () => {
    shown({ database: '/data/shop.sqlite', databasePath: '/data/shop.sqlite' });
    const span = screen.getByTitle('/data/shop.sqlite');
    expect(span.textContent).toBe('shop');
    expect(span.className).toBe('sql-database');
  });

  it('strips one trailing .SQLITE case-insensitively', () => {
    shown({ database: '/data/SHOP.SQLITE', databasePath: '/data/SHOP.SQLITE' });
    expect(screen.getByTitle('/data/SHOP.SQLITE').textContent).toBe('SHOP');
  });

  it('keeps an earlier .sqlite in the label', () => {
    shown({ database: '/data/shop.sqlite.sqlite', databasePath: '/data/shop.sqlite.sqlite' });
    expect(screen.getByTitle('/data/shop.sqlite.sqlite').textContent).toBe('shop.sqlite');
  });

  it('keeps a .db extension in the label', () => {
    shown({ database: '/data/shop.db', databasePath: '/data/shop.db' });
    expect(screen.getByTitle('/data/shop.db').textContent).toBe('shop.db');
  });

  it('renders no select for a path-backed tab', () => {
    shown({ database: '/data/shop.sqlite', databasePath: '/data/shop.sqlite' });
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('offers the registry databases in a select and asks to open the one chosen', () => {
    const onOpen = vi.fn<(name: string) => void>();
    shown({ databases: [
      { name: 'shop', exists: true, open: true },
      { name: 'analytics', exists: true, open: false },
    ] }, onOpen);
    const select = screen.getByLabelText('Database') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(['shop', 'analytics']);
    fireEvent.change(select, { target: { value: 'analytics' } });
    expect(onOpen).toHaveBeenCalledWith('analytics');
  });

  it('renders the named select when databasePath is null', () => {
    shown({ databasePath: null });
    expect(screen.getByLabelText('Database')).toBeInstanceOf(HTMLSelectElement);
  });

  it('renders the named select when databasePath is omitted', () => {
    shown();
    expect(screen.getByLabelText('Database')).toBeInstanceOf(HTMLSelectElement);
  });
});
