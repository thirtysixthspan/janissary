import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileNavigatorPullButton } from './FileNavigatorPullButton';

describe('FileNavigatorPullButton', () => {
  it('forwards clicks through its action callback', () => {
    const onClick = vi.fn();
    const { container } = render(<FileNavigatorPullButton onClick={onClick} />);
    fireEvent.click(container.querySelector('.files-pull')!);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('rests with no status modifier and the plain tooltip', () => {
    const { container } = render(<FileNavigatorPullButton onClick={vi.fn()} />);
    const button = container.querySelector('.files-pull')!;
    expect(button.className).toBe('files-pull');
    expect(button.getAttribute('title')).toBe('Pull from origin');
  });

  it('spins while a pull is in flight', () => {
    const { container } = render(<FileNavigatorPullButton status="pulling" onClick={vi.fn()} />);
    const button = container.querySelector('.files-pull--pulling')!;
    expect(button.getAttribute('title')).toBe('Pull from origin: pulling');
  });

  it('marks a pull that succeeded', () => {
    const { container } = render(<FileNavigatorPullButton status="pulled" onClick={vi.fn()} />);
    const button = container.querySelector('.files-pull--pulled')!;
    expect(button.getAttribute('title')).toBe('Pull from origin: pulled');
  });

  it('marks a pull that failed and points at the notifications tab', () => {
    const { container } = render(<FileNavigatorPullButton status="error" onClick={vi.fn()} />);
    const button = container.querySelector('.files-pull--error')!;
    expect(button.getAttribute('title')).toBe('Pull from origin: failed — see notifications');
  });

  it('stays clickable while a pull is in flight', () => {
    const onClick = vi.fn();
    const { container } = render(<FileNavigatorPullButton status="pulling" onClick={onClick} />);
    fireEvent.click(container.querySelector('.files-pull')!);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
