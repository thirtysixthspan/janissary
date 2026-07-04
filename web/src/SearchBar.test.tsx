import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SearchBar } from './SearchBar';

function renderBar(overrides: Partial<React.ComponentProps<typeof SearchBar>> = {}) {
  const onChange = vi.fn();
  const onStepOlder = vi.fn();
  const onStepNewer = vi.fn();
  const onClose = vi.fn();
  const commandInputRef = { current: document.createElement('textarea') };
  const utils = render(
    <SearchBar
      pattern="error"
      status="match"
      position={{ current: 3, total: 17 }}
      currentText="an error occurred"
      onChange={onChange}
      onStepOlder={onStepOlder}
      onStepNewer={onStepNewer}
      onClose={onClose}
      commandInputRef={commandInputRef}
      {...overrides}
    />,
  );
  return { ...utils, onChange, onStepOlder, onStepNewer, onClose, commandInputRef };
}

describe('SearchBar', () => {
  it('renders the result line and the pattern input', () => {
    renderBar();
    expect(screen.getByText(/3\/17\s+an error occurred/)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('error');
  });

  it('focuses the input on mount', () => {
    renderBar();
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('calls onChange as the pattern is edited', () => {
    const { onChange } = renderBar();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'timeout' } });
    expect(onChange).toHaveBeenCalledWith('timeout');
  });

  it('steps to an older match on ArrowUp', () => {
    const { onStepOlder } = renderBar();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowUp' });
    expect(onStepOlder).toHaveBeenCalled();
  });

  it('steps to a newer match on ArrowDown', () => {
    const { onStepNewer } = renderBar();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' });
    expect(onStepNewer).toHaveBeenCalled();
  });

  it('is a no-op on Enter', () => {
    const { onChange, onClose, onStepOlder, onStepNewer } = renderBar();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onStepOlder).not.toHaveBeenCalled();
    expect(onStepNewer).not.toHaveBeenCalled();
  });

  it('closes and refocuses the command input on Escape', () => {
    const { onClose, commandInputRef } = renderBar();
    const focusSpy = vi.spyOn(commandInputRef.current!, 'focus');
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
  });

  it('shows no result line for an empty pattern', () => {
    renderBar({ pattern: '', status: 'empty', position: null, currentText: null });
    expect(screen.queryByText(/./, { selector: '.search-result' })).not.toBeInTheDocument();
  });

  it('shows "No matches" when the pattern has no matches', () => {
    renderBar({ status: 'no-match', position: null, currentText: null });
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('shows "Invalid pattern" for an invalid regex', () => {
    renderBar({ status: 'invalid', position: null, currentText: null });
    expect(screen.getByText('Invalid pattern')).toBeInTheDocument();
  });
});
