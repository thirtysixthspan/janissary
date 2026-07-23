import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EditorSaveButton } from './EditorSaveButton';

describe('EditorSaveButton', () => {
  it('shows a Save tooltip', () => {
    const { getByTitle } = render(<EditorSaveButton dirty onSave={() => {}} />);
    expect(getByTitle('Save')).toBeTruthy();
  });

  it('is disabled when there are no unsaved changes', () => {
    const { getByTitle } = render(<EditorSaveButton dirty={false} onSave={() => {}} />);
    expect(getByTitle('Save')).toBeDisabled();
  });

  it('is enabled when there are unsaved changes', () => {
    const { getByTitle } = render(<EditorSaveButton dirty onSave={() => {}} />);
    expect(getByTitle('Save')).not.toBeDisabled();
  });

  it('calls onSave when clicked', () => {
    const onSave = vi.fn();
    const { getByTitle } = render(<EditorSaveButton dirty onSave={onSave} />);
    getByTitle('Save').click();
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
