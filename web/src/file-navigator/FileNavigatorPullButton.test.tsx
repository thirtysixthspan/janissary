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
});
