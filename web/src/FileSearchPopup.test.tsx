import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileSearchPopup } from './FileSearchPopup';

function renderPopup(overrides: Partial<React.ComponentProps<typeof FileSearchPopup>> = {}) {
  const onChangeQuery = vi.fn();
  const onReveal = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <FileSearchPopup
      query="task"
      onChangeQuery={onChangeQuery}
      paths={['src/tasks.md', 'src/other.md']}
      loading={false}
      onReveal={onReveal}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { ...utils, onChangeQuery, onReveal, onClose };
}

describe('FileSearchPopup', () => {
  it('prefixes the matched path line with "> "', () => {
    renderPopup();
    expect(screen.getByText('> src/tasks.md', { selector: '.search-result' })).toBeInTheDocument();
  });

  it('shows the no-match placeholder without a "> " prefix', () => {
    renderPopup({ query: 'zzz' });
    expect(screen.getByText('(no matching files)', { selector: '.search-result' })).toBeInTheDocument();
  });

  it('shows the loading placeholder without a "> " prefix', () => {
    renderPopup({ loading: true });
    expect(screen.getByText('Searching…', { selector: '.search-result' })).toBeInTheDocument();
  });
});
