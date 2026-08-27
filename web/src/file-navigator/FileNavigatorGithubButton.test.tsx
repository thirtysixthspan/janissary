import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileNavigatorGithubButton } from './FileNavigatorGithubButton';

describe('FileNavigatorGithubButton', () => {
  it('forwards clicks through its action callback', () => {
    const onClick = vi.fn();
    const { container } = render(<FileNavigatorGithubButton onClick={onClick} />);
    fireEvent.click(container.querySelector('.files-github')!);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
