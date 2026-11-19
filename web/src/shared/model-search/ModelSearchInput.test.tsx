import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { HarnessModelPair } from './model-search';
import { ModelSearchInput } from './ModelSearchInput';

type WrapperProps = {
  ids: string[];
  roleEntries: readonly (readonly HarnessModelPair[])[];
  harness?: string;
  disabled?: boolean;
};

function Controlled({ ids, roleEntries, harness = 'claude', disabled = false }: WrapperProps) {
  const [value, setValue] = useState('');
  return (
    <ModelSearchInput
      ids={ids}
      roleEntries={roleEntries}
      harness={harness}
      value={value}
      onChange={setValue}
      placeholder="model search"
      aria-label="Model for the new entry"
      disabled={disabled}
    />
  );
}

const field = () => screen.getByPlaceholderText('model search');
const list = (container: HTMLElement) => container.querySelector('.model-search-list');
const rows = (container: HTMLElement) => [...container.querySelectorAll('.model-search-row:not(.model-search-muted)')];
const highlighted = (container: HTMLElement) => container.querySelector('.model-search-row.highlighted');
const focusField = () => act(() => { field().focus(); });

describe('ModelSearchInput', () => {
  it('opens the most-used list with no row highlighted on focus', () => {
    const ids = ['claude-opus-4', 'claude-sonnet-4'];
    const roleEntries = [[{ harness: 'claude', model: 'claude-sonnet-4' }]];
    const { container } = render(<Controlled ids={ids} roleEntries={roleEntries} />);
    expect(list(container)).toBeNull();
    focusField();
    expect(list(container)).not.toBeNull();
    expect(rows(container).map((row) => row.textContent)).toEqual(['claude-sonnet-4']);
    expect(highlighted(container)).toBeNull();
  });

  it('prompts to type when blank and nothing is used', () => {
    const { container } = render(<Controlled ids={['opus']} roleEntries={[]} />);
    focusField();
    expect(screen.getByText('type to search')).toBeInTheDocument();
    expect(rows(container)).toHaveLength(0);
  });

  it('filters on typing, marks the matches, and highlights the first row', () => {
    const ids = ['claude-opus-4', 'claude-sonnet-4', 'gpt-4o'];
    const { container } = render(<Controlled ids={ids} roleEntries={[]} />);
    focusField();
    fireEvent.change(field(), { target: { value: 'claude' } });
    expect(rows(container).map((row) => row.textContent)).toEqual(['claude-opus-4', 'claude-sonnet-4']);
    const marks = [...container.querySelectorAll(':scope .model-search-row mark')].map((mark) => mark.textContent);
    expect(marks).toEqual(['claude', 'claude']);
    expect(highlighted(container)).toBe(rows(container)[0]);
  });

  it('reports no matching models for unmatched text', () => {
    const { container } = render(<Controlled ids={['opus', 'sonnet']} roleEntries={[]} />);
    focusField();
    fireEvent.change(field(), { target: { value: 'zzz' } });
    expect(screen.getByText('No matching models')).toBeInTheDocument();
    expect(rows(container)).toHaveLength(0);
  });

  it('highlights a hovered row and keeps the highlight after the pointer leaves', () => {
    const ids = ['claude-opus-4', 'claude-sonnet-4'];
    const { container } = render(<Controlled ids={ids} roleEntries={[]} />);
    focusField();
    fireEvent.change(field(), { target: { value: 'claude' } });
    const second = rows(container)[1];
    fireEvent.mouseEnter(second);
    expect(highlighted(container)).toBe(second);
    fireEvent.mouseLeave(second);
    expect(highlighted(container)).toBe(second);
  });

  it('keeps the highlight when more text leaves the same rows', () => {
    const ids = ['opus', 'opuses'];
    const { container } = render(<Controlled ids={ids} roleEntries={[]} />);
    focusField();
    fireEvent.change(field(), { target: { value: 'opu' } });
    const second = rows(container)[1];
    fireEvent.mouseEnter(second);
    expect(highlighted(container)).toBe(second);
    fireEvent.change(field(), { target: { value: 'opus' } });
    expect(rows(container).map((row) => row.textContent)).toEqual(['opus', 'opuses']);
    expect(highlighted(container)).toBe(rows(container)[1]);
  });

  it('fills the clicked id, closes the list, and keeps focus in the input', () => {
    const ids = ['claude-opus-4', 'claude-sonnet-4'];
    const { container } = render(<Controlled ids={ids} roleEntries={[]} />);
    focusField();
    fireEvent.change(field(), { target: { value: 'claude' } });
    const row = rows(container)[0];
    expect(fireEvent.mouseDown(row)).toBe(false);
    fireEvent.click(row);
    expect(field()).toHaveValue('claude-opus-4');
    expect(list(container)).toBeNull();
    expect(document.activeElement).toBe(field());
  });

  it('reopens the list on typing after a pick closed it', () => {
    const ids = ['claude-opus-4', 'claude-sonnet-4'];
    const { container } = render(<Controlled ids={ids} roleEntries={[]} />);
    focusField();
    fireEvent.change(field(), { target: { value: 'claude' } });
    fireEvent.click(rows(container)[0]);
    expect(list(container)).toBeNull();
    fireEvent.change(field(), { target: { value: 'claude-son' } });
    expect(list(container)).not.toBeNull();
    expect(rows(container).map((row) => row.textContent)).toEqual(['claude-sonnet-4']);
  });

  it('closes the list on blur', () => {
    const { container } = render(<Controlled ids={['opus']} roleEntries={[]} />);
    focusField();
    expect(list(container)).not.toBeNull();
    fireEvent.blur(field());
    expect(list(container)).toBeNull();
  });

  it('reopens a blank list with no highlight after a hovered row is blurred', () => {
    const ids = ['opus', 'sonnet'];
    const roleEntries = [[
      { harness: 'claude', model: 'opus' },
      { harness: 'claude', model: 'sonnet' },
    ]];
    const { container } = render(<Controlled ids={ids} roleEntries={roleEntries} />);
    focusField();
    fireEvent.mouseEnter(rows(container)[1]);
    expect(highlighted(container)?.textContent).toBe('sonnet');
    fireEvent.blur(field());
    expect(list(container)).toBeNull();
    field().blur();
    focusField();
    expect(list(container)).not.toBeNull();
    expect(highlighted(container)).toBeNull();
  });

  it('keeps the text and resets the highlight when new ids change the matches', () => {
    const ids = ['claude-opus-4', 'claude-sonnet-4'];
    const { container, rerender } = render(<Controlled ids={ids} roleEntries={[]} />);
    focusField();
    fireEvent.change(field(), { target: { value: 'claude' } });
    fireEvent.mouseEnter(rows(container)[1]);
    expect(highlighted(container)).toBe(rows(container)[1]);
    rerender(<Controlled ids={['claude-opus-4', 'gpt-4o']} roleEntries={[]} />);
    expect(field()).toHaveValue('claude');
    expect(rows(container).map((row) => row.textContent)).toEqual(['claude-opus-4']);
    expect(highlighted(container)).toBe(rows(container)[0]);
  });

  it('leaves a blank list unhighlighted when new roles reorder the most-used models', () => {
    const ids = ['opus', 'sonnet'];
    const first = [[{ harness: 'claude', model: 'opus' }, { harness: 'claude', model: 'sonnet' }]];
    const second = [[{ harness: 'claude', model: 'sonnet' }, { harness: 'claude', model: 'opus' }]];
    const { container, rerender } = render(<Controlled ids={ids} roleEntries={first} />);
    focusField();
    expect(rows(container).map((row) => row.textContent)).toEqual(['opus', 'sonnet']);
    fireEvent.mouseEnter(rows(container)[1]);
    expect(highlighted(container)?.textContent).toBe('sonnet');
    rerender(<Controlled ids={ids} roleEntries={second} />);
    expect(rows(container).map((row) => row.textContent)).toEqual(['sonnet', 'opus']);
    expect(highlighted(container)).toBeNull();
  });

  it('keeps the highlight when rerendered with new but equal-content arrays', () => {
    const ids = ['opus', 'sonnet'];
    const roleEntries: readonly (readonly HarnessModelPair[])[] = [];
    const { container, rerender } = render(<Controlled ids={ids} roleEntries={roleEntries} />);
    focusField();
    fireEvent.change(field(), { target: { value: 'o' } });
    fireEvent.mouseEnter(rows(container)[1]);
    expect(highlighted(container)?.textContent).toBe('sonnet');
    rerender(<Controlled ids={[...ids]} roleEntries={[...roleEntries]} />);
    expect(highlighted(container)?.textContent).toBe('sonnet');
  });

  it('removes the list when an open input becomes disabled', () => {
    const ids = ['opus'];
    const { container, rerender } = render(<Controlled ids={ids} roleEntries={[]} />);
    focusField();
    expect(list(container)).not.toBeNull();
    rerender(<Controlled ids={ids} roleEntries={[]} disabled />);
    expect(field()).toBeDisabled();
    expect(list(container)).toBeNull();
  });
});
