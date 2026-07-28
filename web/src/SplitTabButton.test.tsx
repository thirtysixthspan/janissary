import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SplitTabButton } from './SplitTabButton';

describe('SplitTabButton', () => {
  it('invokes its callback', () => {
    const onClick = vi.fn();
    render(<SplitTabButton onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Split' });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
