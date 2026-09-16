import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EditorCommitButton } from './EditorCommitButton';

describe('EditorCommitButton', () => {
  it('rests with the plain tooltip and forwards its click', () => {
    const onClick = vi.fn();
    const { container } = render(<EditorCommitButton commit={undefined} onClick={onClick} />);
    const button = container.querySelector('button')!;
    expect(button.className).toBe('editor-commit-button');
    expect(button.getAttribute('title')).toBe('Commit to origin');
    expect(button.getAttribute('aria-label')).toBe('Commit to origin');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('stays clickable in every state and names the state in its tooltip', () => {
    for (const state of ['committing', 'committed', 'error'] as const) {
      const onClick = vi.fn();
      const { container } = render(<EditorCommitButton commit={state} onClick={onClick} />);
      const button = container.querySelector('button')!;
      expect(button.className).toBe(`editor-commit-button editor-commit-button--${state}`);
      expect(button.getAttribute('title')).toBe(`Commit to origin: ${state === 'error' ? 'failed — see notifications' : state}`);
      fireEvent.click(button);
      expect(onClick).toHaveBeenCalledOnce();
    }
  });
});
