import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DockCycleHeader } from './DockCycleHeader';

describe('DockCycleHeader', () => {
  it('calls onCycle with the right dock when clicked while docked left', () => {
    const onCycle = vi.fn();
    render(<DockCycleHeader dock="left" onCycle={onCycle} classPrefix="notifications" />);
    fireEvent.click(screen.getByTitle('Move to right sidebar'));
    expect(onCycle).toHaveBeenCalledWith('right');
  });

  it('calls onCycle with the left dock when clicked while docked right', () => {
    const onCycle = vi.fn();
    render(<DockCycleHeader dock="right" onCycle={onCycle} classPrefix="notifications" />);
    fireEvent.click(screen.getByTitle('Move to left sidebar'));
    expect(onCycle).toHaveBeenCalledWith('left');
  });

  it('renders no dock-cycle button and never calls onCycle while undocked', () => {
    const onCycle = vi.fn();
    render(<DockCycleHeader onCycle={onCycle} classPrefix="notifications" />);
    expect(screen.queryByTitle('Move to left sidebar')).toBeNull();
    expect(screen.queryByTitle('Move to right sidebar')).toBeNull();
    expect(onCycle).not.toHaveBeenCalled();
  });
});
