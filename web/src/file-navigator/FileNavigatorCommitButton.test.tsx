import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileNavigatorCommitButton } from './FileNavigatorCommitButton';

describe('FileNavigatorCommitButton', () => {
  it('forwards clicks through its action callback', () => {
    const onClick = vi.fn();
    const { container } = render(<FileNavigatorCommitButton onClick={onClick} />);
    fireEvent.click(container.querySelector('.files-commit')!);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('rests with no status modifier and the plain tooltip', () => {
    const { container } = render(<FileNavigatorCommitButton onClick={vi.fn()} />);
    const button = container.querySelector('.files-commit')!;
    expect(button.className).toBe('files-commit');
    expect(button.getAttribute('title')).toBe('Commit changes to origin');
  });

  it('spins while a commit is in flight', () => {
    const { container } = render(<FileNavigatorCommitButton status="committing" onClick={vi.fn()} />);
    const button = container.querySelector('.files-commit--committing')!;
    expect(button.getAttribute('title')).toBe('Commit changes to origin: committing');
  });

  it('marks a commit that landed', () => {
    const { container } = render(<FileNavigatorCommitButton status="committed" onClick={vi.fn()} />);
    const button = container.querySelector('.files-commit--committed')!;
    expect(button.getAttribute('title')).toBe('Commit changes to origin: committed');
  });

  it('marks a commit that failed and points at the notifications tab', () => {
    const { container } = render(<FileNavigatorCommitButton status="error" onClick={vi.fn()} />);
    const button = container.querySelector('.files-commit--error')!;
    expect(button.getAttribute('title')).toBe('Commit changes to origin: failed — see notifications');
  });

  it('names the target branch in the tooltip when given one', () => {
    const { container } = render(<FileNavigatorCommitButton branch="main" onClick={vi.fn()} />);
    const button = container.querySelector('.files-commit')!;
    expect(button.getAttribute('title')).toBe('Commit changes to origin (branch main)');
  });

  it('names the target branch in every status tooltip too', () => {
    const { container } = render(<FileNavigatorCommitButton branch="feature/x" status="committing" onClick={vi.fn()} />);
    const button = container.querySelector('.files-commit--committing')!;
    expect(button.getAttribute('title')).toBe('Commit changes to origin (branch feature/x): committing');
  });

  it('stays clickable in every state', () => {
    for (const status of ['committing', 'committed', 'error'] as const) {
      const onClick = vi.fn();
      const { container } = render(<FileNavigatorCommitButton status={status} onClick={onClick} />);
      fireEvent.click(container.querySelector('.files-commit')!);
      expect(onClick).toHaveBeenCalledOnce();
    }
  });
});
